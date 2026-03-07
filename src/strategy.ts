import { getCandles, getWalletBalance, placeOrder, TickerInfo } from './bybit';
import { detectDivergence, DivergenceType } from './indicators';
import { config, Timeframe } from './config';
import { logger } from './logger';
import { hasOpenPosition, addPosition, OpenPosition } from './positions';

export interface TradeSignal {
  symbol: string;
  direction: 'long' | 'short';
  strength: 'weak' | 'strong';
  confirmedTimeframes: string[];
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  qty: number;
  orderId?: string;
}

interface TimeframeAnalysis {
  timeframe: Timeframe;
  divergenceType: DivergenceType;
}

/**
 * Analyze a single symbol across all configured timeframes
 */
async function analyzeSymbol(symbol: string): Promise<TradeSignal | null> {
  const timeframes = config.strategy.timeframes;
  const analyses: TimeframeAnalysis[] = [];

  for (const tf of timeframes) {
    try {
      const candles = await getCandles(symbol, tf, config.strategy.candlesLookback);
      const divergence = detectDivergence(candles, config.strategy.rsiPeriod);

      if (divergence.type) {
        logger.info(
          `  ${symbol} ${tf}m: ${divergence.type} divergence | ` +
          `Price: ${divergence.priceSwing1.toFixed(4)} → ${divergence.priceSwing2.toFixed(4)} | ` +
          `RSI: ${divergence.rsiSwing1.toFixed(1)} → ${divergence.rsiSwing2.toFixed(1)}`
        );
      }

      analyses.push({ timeframe: tf, divergenceType: divergence.type });
    } catch (err) {
      logger.warn(`Failed to analyze ${symbol} on ${tf}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Count confirmations per direction
  const bullishTfs = analyses
    .filter((a) => a.divergenceType === 'bullish')
    .map((a) => a.timeframe);
  const bearishTfs = analyses
    .filter((a) => a.divergenceType === 'bearish')
    .map((a) => a.timeframe);

  const minTfs = config.strategy.minTimeframesForEntry;

  let confirmedTfs: string[] = [];
  let direction: 'long' | 'short' | null = null;

  if (bullishTfs.length >= minTfs && bullishTfs.length >= bearishTfs.length) {
    direction = 'long';
    confirmedTfs = bullishTfs;
  } else if (bearishTfs.length >= minTfs && bearishTfs.length > bullishTfs.length) {
    direction = 'short';
    confirmedTfs = bearishTfs;
  }

  if (!direction) {
    return null;
  }

  const strength: 'weak' | 'strong' = confirmedTfs.length >= 3 ? 'strong' : 'weak';

  // Get current price (use last candle close from 15m)
  const recentCandles = await getCandles(symbol, '15', 1);
  const currentPrice = recentCandles[recentCandles.length - 1]?.close || 0;

  if (!currentPrice) {
    logger.warn(`Could not get current price for ${symbol}`);
    return null;
  }

  // Calculate TP/SL
  const slPct = config.strategy.stopLossPct / 100;
  const tpPct = config.strategy.takeProfitPct / 100;

  const stopLoss =
    direction === 'long'
      ? currentPrice * (1 - slPct)
      : currentPrice * (1 + slPct);

  const takeProfit =
    direction === 'long'
      ? currentPrice * (1 + tpPct)
      : currentPrice * (1 - tpPct);

  return {
    symbol,
    direction,
    strength,
    confirmedTimeframes: confirmedTfs,
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    qty: 0, // will be calculated after balance fetch
  };
}

/**
 * Calculate position size based on balance
 */
async function calculatePositionSize(entryPrice: number): Promise<number> {
  const balance = await getWalletBalance();
  const positionUsd = (balance.totalEquity * config.strategy.positionSizePct) / 100;
  const qty = positionUsd / entryPrice;
  logger.info(
    `Balance: $${balance.totalEquity.toFixed(2)} | Position: $${positionUsd.toFixed(2)} | Qty: ${qty.toFixed(6)}`
  );
  return qty;
}

/**
 * Execute a trade signal
 */
async function executeTrade(signal: TradeSignal): Promise<TradeSignal> {
  const side = signal.direction === 'long' ? 'Buy' : 'Sell';

  try {
    const result = await placeOrder(
      signal.symbol,
      side,
      signal.qty,
      signal.entryPrice,
      signal.stopLoss,
      signal.takeProfit
    );

    logger.info(`Order placed: ${result.orderId} for ${signal.symbol}`);
    return { ...signal, orderId: result.orderId };
  } catch (err) {
    logger.error(`Failed to place order for ${signal.symbol}`, err);
    throw err;
  }
}

/**
 * Main strategy runner — analyzes all top pairs and executes trades
 */
export async function runStrategy(topPairs: TickerInfo[]): Promise<TradeSignal[]> {
  const signals: TradeSignal[] = [];
  const executedSymbols = new Set<string>();

  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`Analyzing ${topPairs.length} pairs for RSI divergence...`);
  logger.info(`${'='.repeat(60)}`);

  // Fetch balance once upfront
  let balance: Awaited<ReturnType<typeof getWalletBalance>> | null = null;
  try {
    balance = await getWalletBalance();
    logger.info(`Account balance: $${balance.totalEquity.toFixed(2)} USDT`);
  } catch (err) {
    logger.error('Could not fetch balance', err);
    // Continue analysis even without balance (won't place orders)
  }

  for (const pair of topPairs) {
    if (executedSymbols.has(pair.symbol)) continue;

    logger.info(`\nAnalyzing ${pair.symbol} (vol24h: $${(pair.volume24h / 1e6).toFixed(1)}M)`);

    try {
      const signal = await analyzeSymbol(pair.symbol);

      if (!signal) {
        logger.info(`  ${pair.symbol}: No divergence signal`);
        continue;
      }

      logger.info(
        `  ✨ SIGNAL: ${signal.direction.toUpperCase()} | ` +
        `TFs: ${signal.confirmedTimeframes.join(',')} | Strength: ${signal.strength}`
      );

      // Check if position already open for this symbol
      if (hasOpenPosition(signal.symbol)) {
        logger.info(`  ⏭️ Skipping ${signal.symbol} — position already open`);
        continue;
      }

      // Calculate position size
      if (balance) {
        const positionUsd = (balance.totalEquity * config.strategy.positionSizePct) / 100;
        signal.qty = positionUsd / signal.entryPrice;
      } else {
        logger.warn('Skipping trade execution: no balance info');
        signals.push(signal);
        continue;
      }

      // Execute trade
      try {
        const executed = await executeTrade(signal);
        
        // Save position to tracking file
        const position: OpenPosition = {
          symbol: executed.symbol,
          direction: executed.direction,
          entryPrice: executed.entryPrice,
          qty: executed.qty,
          orderId: executed.orderId!,
          openedAt: new Date().toISOString(),
        };
        addPosition(position);
        
        signals.push(executed);
        executedSymbols.add(pair.symbol);
        logger.info(`  ✅ Trade executed: ${executed.orderId}`);
      } catch (err) {
        logger.error(`  ❌ Trade failed for ${signal.symbol}`, err);
        // Still include signal (without orderId) for notifications
        signals.push(signal);
      }
    } catch (err) {
      logger.error(`Error analyzing ${pair.symbol}`, err);
    }

    // Small delay between pairs to avoid hammering SSH
    await sleep(500);
  }

  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`Strategy complete. Signals found: ${signals.length}`);
  logger.info(`${'='.repeat(60)}\n`);

  return signals;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
