import { getCandles, getWalletBalance, placeOrder, TickerInfo } from './bybit';
import { detectDivergence, DivergenceType, getTrendDirection } from './indicators';
import { config, Timeframe } from './config';
import { logger } from './logger';
import { hasOpenPosition, addPosition, OpenPosition, loadPositions } from './positions';
import { getDailyStats, recordTrade, canTradeToday } from './daily-stats';

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

  // NOTE: EMA trend filter removed - it was blocking too many trades
  // RSI divergence predicts reversal, so filtering by trend was counterproductive

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
 * Multi-pair mode: analyzes all pairs first, then executes best signals
 */
export async function runStrategy(topPairs: TickerInfo[]): Promise<TradeSignal[]> {
  // Check daily limits
  const daily = getDailyStats();
  const tradeCheck = canTradeToday();
  
  if (!tradeCheck.allowed) {
    logger.info(`🚫 Cannot trade today: ${tradeCheck.reason}`);
    logger.info(`   Daily stats: ${daily.trades} trades, $${daily.profit.toFixed(2)} P/L`);
    return [];
  }

  // Load current positions to know available slots
  const openPositions = loadPositions();
  const currentPositions = openPositions.length;
  const maxPositions = config.strategy.maxConcurrentPositions;
  const availableSlots = Math.max(0, maxPositions - currentPositions);
  
  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`Analyzing ${topPairs.length} pairs for RSI divergence...`);
  logger.info(`📊 Daily: ${daily.trades}/${config.strategy.maxTradesPerDay} trades | ` +
    `Positions: ${currentPositions}/${maxPositions} open`);
  logger.info(`${'='.repeat(60)}`);

  // Fetch balance once upfront
  let balance: Awaited<ReturnType<typeof getWalletBalance>> | null = null;
  try {
    balance = await getWalletBalance();
    logger.info(`Account balance: $${balance.totalEquity.toFixed(2)} USDT`);
  } catch (err) {
    logger.error('Could not fetch balance', err);
  }

  // Phase 1: Collect ALL signals (don't execute yet)
  const pendingSignals: TradeSignal[] = [];
  
  for (const pair of topPairs) {
    // Skip if already have position
    if (hasOpenPosition(pair.symbol)) continue;

    logger.info(`\nAnalyzing ${pair.symbol} (vol24h: $${(pair.volume24h / 1e6).toFixed(1)}M)`);

    try {
      const signal = await analyzeSymbol(pair.symbol);

      if (!signal) {
        continue;
      }

      logger.info(
        `  ✨ SIGNAL: ${signal.direction.toUpperCase()} | ` +
        `TFs: ${signal.confirmedTimeframes.join(',')} | Strength: ${signal.strength}`
      );

      // Calculate position size
      if (balance) {
        const positionUsd = (balance.totalEquity * config.strategy.positionSizePct) / 100;
        signal.qty = positionUsd / signal.entryPrice;
      }

      pendingSignals.push(signal);
    } catch (err) {
      logger.error(`Error analyzing ${pair.symbol}`, err);
    }

    // Small delay between pairs
    await sleep(300);
  }

  // Phase 2: Execute best signals based on available slots
  const signals: TradeSignal[] = [];
  
  if (pendingSignals.length > 0) {
    // Sort by strength (strong > weak)
    pendingSignals.sort((a, b) => {
      const strengthOrder = { strong: 2, weak: 1 };
      return strengthOrder[b.strength] - strengthOrder[a.strength];
    });

    const toExecute = pendingSignals.slice(0, availableSlots);
    
    logger.info(`\n📋 Found ${pendingSignals.length} signals, executing ${toExecute.length}...`);

    for (const signal of toExecute) {
      // Check trade limit again
      const check = canTradeToday();
      if (!check.allowed) {
        logger.info(`  ⏹️ Daily limit reached, stopping execution`);
        break;
      }

      try {
        const executed = await executeTrade(signal);
        
        // Save position
        const position: OpenPosition = {
          symbol: executed.symbol,
          direction: executed.direction,
          entryPrice: executed.entryPrice,
          qty: executed.qty,
          orderId: executed.orderId!,
          openedAt: new Date().toISOString(),
        };
        addPosition(position);
        
        // Record trade in daily stats
        recordTrade(0); // PnL will be calculated when position closes
        
        signals.push(executed);
        logger.info(`  ✅ Trade executed: ${executed.orderId}`);
      } catch (err) {
        logger.error(`  ❌ Trade failed for ${signal.symbol}`, err);
        signals.push(signal);
      }
    }
  }

  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`Strategy complete. Trades executed: ${signals.length}/${pendingSignals.length}`);
  logger.info(`${'='.repeat(60)}\n`);

  return signals;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
