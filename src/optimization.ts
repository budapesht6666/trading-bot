import { getCandles, Candle } from './bybit';
import { detectDivergence, DivergenceType } from './indicators';
import { Timeframe } from './config';

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

interface OptimizationParams {
  rsiPeriod: number;
  stopLossPct: number;
  takeProfitPct: number;
}

export interface OptimizationResult extends OptimizationParams {
  totalTrades: number;
  winRate: number;
  netProfit: number;
  maxDrawdownPct: number;
}

/**
 * Run backtest with custom parameters (for optimization)
 */
export async function runBacktestWithParams(
  candles: Candle[],
  params: OptimizationParams
): Promise<BacktestResult> {
  const { rsiPeriod, stopLossPct, takeProfitPct } = params;
  
  const slPct = stopLossPct / 100;
  const tpPct = takeProfitPct / 100;
  const lookback = 100;

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
  let equity = 10000;

  for (let i = lookback + 20; i < candles.length; i++) {
    const currentCandle = candles[i];
    const currentPrice = currentCandle.close;
    const currentTime = currentCandle.openTime;

    if (equity > peakEquity) peakEquity = equity;
    const drawdown = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
    if (drawdown > result.maxDrawdownPct) {
      result.maxDrawdownPct = drawdown;
      result.maxDrawdown = peakEquity - equity;
    }

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
      } else {
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
        const pnl = position.direction === 'long'
          ? (exitPrice - position.entryPrice) * (equity / position.entryPrice)
          : (position.entryPrice - exitPrice) * (equity / position.entryPrice);

        equity += pnl;

        const pnlPct = position.direction === 'long'
          ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;

        result.trades.push({
          entryTime: position.entryTime,
          exitTime: currentTime,
          direction: position.direction,
          entryPrice: position.entryPrice,
          exitPrice,
          pnl,
          pnlPct,
          exitReason: i === candles.length - 1 ? 'end' : exitReason,
        });

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

    if (!position) {
      const historicalCandles = candles.slice(0, i + 1);
      const divergence = detectDivergence(historicalCandles, rsiPeriod);

      if (divergence.type) {
        position = {
          direction: divergence.type === 'bullish' ? 'long' : 'short',
          entryPrice: currentPrice,
          entryTime: currentTime,
          entryIndex: i,
        };
      }
    }
  }

  result.netProfit = equity - 10000;
  result.winRate = result.totalTrades > 0 
    ? (result.winningTrades / result.totalTrades) * 100 
    : 0;
  result.avgWin = result.winningTrades > 0 ? result.totalProfit / result.winningTrades : 0;
  result.avgLoss = result.losingTrades > 0 ? result.totalLoss / result.losingTrades : 0;
  result.avgTrade = result.totalTrades > 0 ? result.netProfit / result.totalTrades : 0;

  return result;
}

/**
 * Fetch historical candles
 */
async function fetchHistoricalCandles(
  symbol: string,
  timeframe: Timeframe,
  daysBack: number
): Promise<Candle[]> {
  const now = Date.now();
  const startTime = now - daysBack * 24 * 60 * 60 * 1000;

  const intervalMap: Record<string, string> = {
    '15': '15m',
    '60': '1h',
    '240': '4h',
  };
  const binanceInterval = intervalMap[timeframe] || '1h';
  
  const allCandles: Candle[] = [];
  let currentStartTime = startTime;

  while (currentStartTime < now) {
    const url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=1000&startTime=${currentStartTime}`;
    
    const res = await fetch(url);
    if (!res.ok) break;
    
    const data = await res.json() as (string | number)[][];
    if (data.length === 0) break;

    const candles: Candle[] = data.map((c) => ({
      openTime: Number(c[0]),
      open: parseFloat(String(c[1])),
      high: parseFloat(String(c[2])),
      low: parseFloat(String(c[3])),
      close: parseFloat(String(c[4])),
      volume: parseFloat(String(c[5])),
    }));

    allCandles.push(...candles);
    if (candles.length < 1000) break;
    currentStartTime = candles[candles.length - 1].openTime + 1;
    if (allCandles.length > 5000) break;
  }

  return allCandles.sort((a, b) => a.openTime - b.openTime);
}

/**
 * Optimize RSI divergence strategy parameters
 */
export async function runOptimization(
  symbol: string,
  timeframe: Timeframe,
  daysBack: number
): Promise<OptimizationResult[]> {
  const rsiPeriods = [7, 14, 21, 28];
  const stopLossPcts = [1, 2, 3, 4];
  const takeProfitPcts = [2, 4, 6, 8];

  console.log(`\n🔧 Loading data for ${symbol} (${timeframe}m, ${daysBack} days)...`);
  const candles = await fetchHistoricalCandles(symbol, timeframe, daysBack);
  console.log(`   Loaded ${candles.length} candles`);
  
  if (candles.length < 200) {
    console.log('   ⚠️ Not enough data!');
    return [];
  }

  const results: OptimizationResult[] = [];
  const totalCombinations = rsiPeriods.length * stopLossPcts.length * takeProfitPcts.length;
  let current = 0;

  console.log(`\n🚀 Running ${totalCombinations} parameter combinations...\n`);

  for (const rsi of rsiPeriods) {
    for (const sl of stopLossPcts) {
      for (const tp of takeProfitPcts) {
        current++;
        
        const params: OptimizationParams = { rsiPeriod: rsi, stopLossPct: sl, takeProfitPct: tp };
        const backtestResult = await runBacktestWithParams(candles, params);
        
        results.push({
          rsiPeriod: rsi,
          stopLossPct: sl,
          takeProfitPct: tp,
          totalTrades: backtestResult.totalTrades,
          winRate: backtestResult.winRate,
          netProfit: backtestResult.netProfit,
          maxDrawdownPct: backtestResult.maxDrawdownPct * 100,
        });

        if (current % 16 === 0) {
          console.log(`   Progress: ${Math.floor((current / totalCombinations) * 100)}%`);
        }
      }
    }
  }

  // Sort by net profit descending
  results.sort((a, b) => b.netProfit - a.netProfit);

  return results;
}

/**
 * Print optimization results table
 */
export function printOptimizationResults(results: OptimizationResult[], topN = 5): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 OPTIMIZATION RESULTS - Top ' + topN + ' Parameter Combinations');
  console.log('='.repeat(80));
  console.log(`\n${'Rank'.padStart(4)} | ${'RSI Period'.padStart(10)} | ${'SL %'.padStart(6)} | ${'TP %'.padStart(6)} | ${'Trades'.padStart(7)} | ${'Win Rate'.padStart(9)} | ${'Net Profit'.padStart(12)} | ${'Max DD %'.padStart(9)}`);
  console.log('-'.repeat(80));

  for (let i = 0; i < Math.min(topN, results.length); i++) {
    const r = results[i];
    console.log(`${(i + 1).toString().padStart(4)} | ${r.rsiPeriod.toString().padStart(10)} | ${r.stopLossPct.toString().padStart(6)} | ${r.takeProfitPct.toString().padStart(6)} | ${r.totalTrades.toString().padStart(7)} | ${r.winRate.toFixed(1).padStart(9)} | $${r.netProfit.toFixed(2).padStart(12)} | ${r.maxDrawdownPct.toFixed(2).padStart(9)}`);
  }

  console.log('='.repeat(80));
  
  const best = results[0];
  console.log(`\n🏆 Best Parameters:`);
  console.log(`   RSI Period: ${best.rsiPeriod}`);
  console.log(`   Stop Loss: ${best.stopLossPct}%`);
  console.log(`   Take Profit: ${best.takeProfitPct}%`);
  console.log(`   Net Profit: $${best.netProfit.toFixed(2)}`);
  console.log(`   Win Rate: ${best.winRate.toFixed(1)}%`);
  console.log('');
}

// Run if executed directly
if (require.main === module) {
  runOptimization('ETHUSDT', '60', 90).then(printOptimizationResults);
}
