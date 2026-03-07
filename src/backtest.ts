import { getCandles, Candle } from './bybit';
import { detectDivergence, DivergenceType, getTrendDirection } from './indicators';
import { config, Timeframe } from './config';

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfit: number;
  totalLoss: number;
  netProfit: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  avgWin: number;
  avgLoss: number;
  avgTrade: number;
  trades: BacktestTrade[];
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  exitReason: 'tp' | 'sl' | 'end';
}

interface SimPosition {
  direction: 'long' | 'short';
  entryPrice: number;
  entryTime: number;
  entryIndex: number;
}

/**
 * Run backtest on a single symbol
 */
export async function runBacktest(
  symbol: string,
  timeframe: Timeframe,
  daysBack: number = 365
): Promise<BacktestResult> {
  console.log(`\n📊 Backtesting ${symbol} on ${timeframe}m for ${daysBack} days...`);

  // Fetch historical candles (Bybit limit is 200 per request, need to fetch in chunks)
  const candles = await fetchHistoricalCandles(symbol, timeframe, daysBack);
  console.log(`   Loaded ${candles.length} candles`);

  if (candles.length < 200) {
    console.log('   ⚠️ Not enough data for backtest');
    return createEmptyResult();
  }

  const result: BacktestResult = {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalProfit: 0,
    totalLoss: 0,
    netProfit: 0,
    maxDrawdown: 0,
    maxDrawdownPct: 0,
    avgWin: 0,
    avgLoss: 0,
    avgTrade: 0,
    trades: [],
  };

  let position: SimPosition | null = null;
  let peakEquity = 0;
  let equity = 10000; // Start with $10k virtual balance
  
  // Debug counters
  let totalDivergences = 0;
  let filteredByTrend = 0;
  let entries = 0;

  const slPct = config.strategy.stopLossPct / 100;
  const tpPct = config.strategy.takeProfitPct / 100;
  const rsiPeriod = config.strategy.rsiPeriod;
  const lookback = config.strategy.candlesLookback;

  // Iterate through candles (skip first N for warmup)
  for (let i = lookback + 20; i < candles.length; i++) {
    const currentCandle = candles[i];
    const currentPrice = currentCandle.close;
    const currentTime = currentCandle.openTime;

    // Update equity tracking
    if (equity > peakEquity) peakEquity = equity;
    const drawdown = (peakEquity - equity) / peakEquity;
    if (drawdown > result.maxDrawdownPct) {
      result.maxDrawdownPct = drawdown;
      result.maxDrawdown = peakEquity - equity;
    }

    // Check if we need to close position (TP/SL)
    if (position) {
      let shouldClose = false;
      let exitPrice = currentPrice;
      let exitReason: 'tp' | 'sl' | 'end' = 'end';

      if (position.direction === 'long') {
        const pnlPct = (currentPrice - position.entryPrice) / position.entryPrice;
        if (pnlPct >= tpPct) {
          exitPrice = position.entryPrice * (1 + tpPct);
          exitReason = 'tp';
          shouldClose = true;
        } else if (pnlPct <= -slPct) {
          exitPrice = position.entryPrice * (1 - slPct);
          exitReason = 'sl';
          shouldClose = true;
        }
      } else { // short
        const pnlPct = (position.entryPrice - currentPrice) / position.entryPrice;
        if (pnlPct >= tpPct) {
          exitPrice = position.entryPrice * (1 - tpPct);
          exitReason = 'tp';
          shouldClose = true;
        } else if (pnlPct <= -slPct) {
          exitPrice = position.entryPrice * (1 + slPct);
          exitReason = 'sl';
          shouldClose = true;
        }
      }

      if (shouldClose || i === candles.length - 1) {
        // Calculate P&L
        const pnl = position.direction === 'long'
          ? (exitPrice - position.entryPrice) * (equity / position.entryPrice)
          : (position.entryPrice - exitPrice) * (equity / position.entryPrice);

        equity += pnl;

        const pnlPct = position.direction === 'long'
          ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;

        const trade: BacktestTrade = {
          entryTime: position.entryTime,
          exitTime: currentTime,
          direction: position.direction,
          entryPrice: position.entryPrice,
          exitPrice,
          pnl,
          pnlPct,
          exitReason: i === candles.length - 1 ? 'end' : exitReason,
        };

        result.trades.push(trade);
        result.totalTrades++;

        if (pnl > 0) {
          result.winningTrades++;
          result.totalProfit += pnl;
        } else {
          result.losingTrades++;
          result.totalLoss += Math.abs(pnl);
        }

        position = null;
      }
    }

    // If no position, check for entry signal
    if (!position) {
      // Get candles up to current point
      const historicalCandles = candles.slice(0, i + 1);
      const divergence = detectDivergence(historicalCandles, rsiPeriod);

      if (divergence.type) {
        totalDivergences++;
        const signalDirection = divergence.type === 'bullish' ? 'long' : 'short';
        
        entries++;
        // Simple entry: enter at current price
        position = {
          direction: signalDirection,
          entryPrice: currentPrice,
          entryTime: currentTime,
          entryIndex: i,
        };
      }
    }

    // Progress update every 10%
    if (i % Math.floor(candles.length / 10) === 0) {
      const progress = Math.floor((i / candles.length) * 100);
      console.log(`   Progress: ${progress}% | Equity: $${equity.toFixed(2)}`);
    }
  }

  // Finalize results
  result.netProfit = equity - 10000;
  result.winRate = result.totalTrades > 0 
    ? (result.winningTrades / result.totalTrades) * 100 
    : 0;
  result.avgWin = result.winningTrades > 0 
    ? result.totalProfit / result.winningTrades 
    : 0;
  result.avgLoss = result.losingTrades > 0 
    ? result.totalLoss / result.losingTrades 
    : 0;
  result.avgTrade = result.totalTrades > 0 
    ? result.netProfit / result.totalTrades 
    : 0;

  // Debug output
  console.log(`   Debug: Total divergences: ${totalDivergences}, Filtered: ${filteredByTrend}, Entered: ${entries}`);

  return result;
}

/**
 * Fetch historical candles from Binance US (not geo-blocked)
 */
async function fetchHistoricalCandles(
  symbol: string,
  timeframe: Timeframe,
  daysBack: number
): Promise<Candle[]> {
  const now = Date.now();
  const startTime = now - daysBack * 24 * 60 * 60 * 1000;

  const binanceInterval = timeframe === '15' ? '15m' : timeframe === '60' ? '1h' : '4h';
  const allCandles: Candle[] = [];
  
  let currentStartTime = startTime;

  // Binance US returns max 1000 candles per request
  while (currentStartTime < now) {
    const url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=1000&startTime=${currentStartTime}`;
    
    const res = await fetch(url);
    
    if (!res.ok) {
      const text = await res.text();
      console.error(`API error ${res.status}:`, text.substring(0, 200));
      break;
    }
    
    const data = await res.json() as (string | number)[][];

    if (data.length === 0) {
      break;
    }

    const candles: Candle[] = data.map((c) => ({
      openTime: Number(c[0]),
      open: parseFloat(String(c[1])),
      high: parseFloat(String(c[2])),
      low: parseFloat(String(c[3])),
      close: parseFloat(String(c[4])),
      volume: parseFloat(String(c[5])),
    }));

    allCandles.push(...candles);

    if (candles.length < 1000) {
      break;
    }
    
    // Move to next batch
    currentStartTime = candles[candles.length - 1].openTime + 1;

    // Safety limit
    if (allCandles.length > 5000) break;
  }

  return allCandles.sort((a, b) => a.openTime - b.openTime);
}

function createEmptyResult(): BacktestResult {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalProfit: 0,
    totalLoss: 0,
    netProfit: 0,
    maxDrawdown: 0,
    maxDrawdownPct: 0,
    avgWin: 0,
    avgLoss: 0,
    avgTrade: 0,
    trades: [],
  };
}

/**
 * Print backtest results nicely
 */
export function printBacktestResults(symbol: string, result: BacktestResult): void {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📈 Backtest Results: ${symbol}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Total Trades:     ${result.totalTrades}`);
  console.log(`Win Rate:         ${result.winRate.toFixed(1)}%`);
  console.log(`Winners:          ${result.winningTrades}`);
  console.log(`Losers:           ${result.losingTrades}`);
  console.log(`-${'-'.repeat(30)}`);
  console.log(`Net Profit:       $${result.netProfit.toFixed(2)}`);
  console.log(`Total Profit:     $${result.totalProfit.toFixed(2)}`);
  console.log(`Total Loss:       $${result.totalLoss.toFixed(2)}`);
  console.log(`Avg Win:          $${result.avgWin.toFixed(2)}`);
  console.log(`Avg Loss:         $${result.avgLoss.toFixed(2)}`);
  console.log(`Avg Trade:        $${result.avgTrade.toFixed(2)}`);
  console.log(`-${'-'.repeat(30)}`);
  console.log(`Max Drawdown:     $${result.maxDrawdown.toFixed(2)} (${(result.maxDrawdownPct * 100).toFixed(2)}%)`);
  console.log(`${'='.repeat(50)}\n`);
}