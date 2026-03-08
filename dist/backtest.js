"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBacktest = runBacktest;
exports.printBacktestResults = printBacktestResults;
exports.runFullBacktest = runFullBacktest;
const indicators_1 = require("./indicators");
const config_1 = require("./config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Run backtest on a single symbol
 */
async function runBacktest(symbol, timeframe, daysBack = 365) {
    console.log(`\n📊 Backtesting ${symbol} on ${timeframe}m for ${daysBack} days...`);
    // Fetch historical candles (Bybit limit is 200 per request, need to fetch in chunks)
    const candles = await fetchHistoricalCandles(symbol, timeframe, daysBack);
    console.log(`   Loaded ${candles.length} candles`);
    if (candles.length < 200) {
        console.log('   ⚠️ Not enough data for backtest');
        return createEmptyResult();
    }
    const result = {
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
    let position = null;
    let peakEquity = 0;
    let equity = 10000; // Start with $10k virtual balance
    // Debug counters
    let totalDivergences = 0;
    let filteredByTrend = 0;
    let entries = 0;
    const slPct = config_1.config.strategy.stopLossPct / 100;
    const tpPct = config_1.config.strategy.takeProfitPct / 100;
    const rsiPeriod = config_1.config.strategy.rsiPeriod;
    const lookback = config_1.config.strategy.candlesLookback;
    // Iterate through candles (skip first N for warmup)
    for (let i = lookback + 20; i < candles.length; i++) {
        const currentCandle = candles[i];
        const currentPrice = currentCandle.close;
        const currentTime = currentCandle.openTime;
        // Update equity tracking
        if (equity > peakEquity)
            peakEquity = equity;
        const drawdown = (peakEquity - equity) / peakEquity;
        if (drawdown > result.maxDrawdownPct) {
            result.maxDrawdownPct = drawdown;
            result.maxDrawdown = peakEquity - equity;
        }
        // Check if we need to close position (TP/SL)
        if (position) {
            let shouldClose = false;
            let exitPrice = currentPrice;
            let exitReason = 'end';
            if (position.direction === 'long') {
                const pnlPct = (currentPrice - position.entryPrice) / position.entryPrice;
                if (pnlPct >= tpPct) {
                    exitPrice = position.entryPrice * (1 + tpPct);
                    exitReason = 'tp';
                    shouldClose = true;
                }
                else if (pnlPct <= -slPct) {
                    exitPrice = position.entryPrice * (1 - slPct);
                    exitReason = 'sl';
                    shouldClose = true;
                }
            }
            else { // short
                const pnlPct = (position.entryPrice - currentPrice) / position.entryPrice;
                if (pnlPct >= tpPct) {
                    exitPrice = position.entryPrice * (1 - tpPct);
                    exitReason = 'tp';
                    shouldClose = true;
                }
                else if (pnlPct <= -slPct) {
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
                const trade = {
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
                }
                else {
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
            const divergence = (0, indicators_1.detectDivergence)(historicalCandles, rsiPeriod);
            if (divergence.type) {
                // MACD confirmation check
                const macdDivergence = (0, indicators_1.detectMACDDivergence)(historicalCandles);
                const macdCross = (0, indicators_1.getMACross)(historicalCandles);
                const macdDivMatch = macdDivergence.type === divergence.type;
                const macdCrossMatch = macdCross === divergence.type;
                const macdConfirmed = macdDivMatch || macdCrossMatch;
                if (!macdConfirmed) {
                    // Skip entry if MACD doesn't confirm
                    continue;
                }
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
async function fetchHistoricalCandles(symbol, timeframe, daysBack) {
    const now = Date.now();
    const startTime = now - daysBack * 24 * 60 * 60 * 1000;
    const binanceInterval = timeframe === '15' ? '15m' : timeframe === '60' ? '1h' : '4h';
    const allCandles = [];
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
        const data = await res.json();
        if (data.length === 0) {
            break;
        }
        const candles = data.map((c) => ({
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
        if (allCandles.length > 5000)
            break;
    }
    return allCandles.sort((a, b) => a.openTime - b.openTime);
}
function createEmptyResult() {
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
function printBacktestResults(symbol, result) {
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
/**
 * Run full backtest on multiple symbols
 */
async function runFullBacktest(symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'], timeframe = '60', daysBack = 90) {
    console.log(`\n🚀 Running full backtest on ${symbols.length} symbols...`);
    console.log(`   Timeframe: ${timeframe}m | Days: ${daysBack}\n`);
    const results = {};
    for (const symbol of symbols) {
        try {
            const result = await runBacktest(symbol, timeframe, daysBack);
            results[symbol] = result;
            printBacktestResults(symbol, result);
        }
        catch (error) {
            console.error(`❌ Error backtesting ${symbol}:`, error);
            results[symbol] = createEmptyResult();
        }
    }
    // Save results to JSON file
    const outputPath = path.join(process.cwd(), 'backtest-results.json');
    const jsonOutput = {
        timestamp: new Date().toISOString(),
        config: {
            symbols,
            timeframe,
            daysBack,
        },
        results: Object.fromEntries(Object.entries(results).map(([symbol, result]) => [
            symbol,
            {
                totalTrades: result.totalTrades,
                winningTrades: result.winningTrades,
                losingTrades: result.losingTrades,
                winRate: result.winRate,
                netProfit: result.netProfit,
                maxDrawdownPct: result.maxDrawdownPct,
                avgWin: result.avgWin,
                avgLoss: result.avgLoss,
            },
        ])),
    };
    fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2));
    console.log(`\n📁 Results saved to ${outputPath}`);
    return results;
}
//# sourceMappingURL=backtest.js.map