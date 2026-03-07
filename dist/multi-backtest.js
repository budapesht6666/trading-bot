"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMultiBacktest = runMultiBacktest;
exports.printSummaryTable = printSummaryTable;
exports.getTopPairs = getTopPairs;
exports.printTopPairs = printTopPairs;
const backtest_1 = require("./backtest");
/**
 * Run backtest on multiple trading pairs
 */
async function runMultiBacktest(symbols, timeframe = '60', daysBack = 90) {
    console.log(`\n🚀 Starting multi-pair backtest`);
    console.log(`   Pairs: ${symbols.join(', ')}`);
    console.log(`   Timeframe: ${timeframe}m`);
    console.log(`   Period: ${daysBack} days`);
    console.log('='.repeat(60));
    const results = [];
    for (const symbol of symbols) {
        try {
            const result = await (0, backtest_1.runBacktest)(symbol, timeframe, daysBack);
            results.push({ symbol, result });
            (0, backtest_1.printBacktestResults)(symbol, result);
        }
        catch (error) {
            console.error(`❌ Error backtesting ${symbol}:`, error);
        }
    }
    return results;
}
/**
 * Print summary table for all results
 */
function printSummaryTable(results) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 MULTI-PAIR BACKTEST SUMMARY');
    console.log('='.repeat(80));
    // Header
    console.log('| Symbol    | Trades | Win Rate | Net Profit | Max DD  |');
    console.log('|-----------|--------|----------|------------|---------|');
    // Data rows
    for (const { symbol, result } of results) {
        const winRate = result.winRate.toFixed(0) + '%';
        const netProfit = result.netProfit >= 0
            ? '+$' + result.netProfit.toFixed(0)
            : '-$' + Math.abs(result.netProfit).toFixed(0);
        const maxDD = (result.maxDrawdownPct * 100).toFixed(0) + '%';
        console.log(`| ${symbol.padEnd(9)} | ${String(result.totalTrades).padEnd(6)} | ${winRate.padEnd(8)} | ${netProfit.padEnd(10)} | ${maxDD.padEnd(7)} |`);
    }
    console.log('='.repeat(80));
}
/**
 * Get TOP-N best performing pairs
 */
function getTopPairs(results, count = 3) {
    return [...results]
        .filter(r => r.result.totalTrades > 0) // Only pairs with trades
        .sort((a, b) => b.result.netProfit - a.result.netProfit)
        .slice(0, count);
}
/**
 * Print TOP-N pairs
 */
function printTopPairs(results, count = 3) {
    const topPairs = getTopPairs(results, count);
    console.log('\n🏆 TOP ' + count + ' BEST PERFORMING PAIRS');
    console.log('-'.repeat(40));
    topPairs.forEach((item, index) => {
        const { symbol, result } = item;
        console.log(`  #${index + 1} ${symbol}: +$${result.netProfit.toFixed(2)} | ` +
            `${result.winRate.toFixed(0)}% win rate | ${result.totalTrades} trades`);
    });
    console.log('-'.repeat(40));
}
// Main execution
async function main() {
    const SYMBOLS = ['ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT'];
    const TIMEFRAME = '60';
    const DAYS_BACK = 90;
    const results = await runMultiBacktest(SYMBOLS, TIMEFRAME, DAYS_BACK);
    printSummaryTable(results);
    printTopPairs(results, 3);
}
main().catch(console.error);
//# sourceMappingURL=multi-backtest.js.map