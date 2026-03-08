"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const backtest_1 = require("./backtest");
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {
        days: 90, // default
        timeframe: '60',
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--symbol':
                result.symbol = args[++i];
                break;
            case '--days':
                result.days = parseInt(args[++i], 10);
                break;
            case '--timeframe':
                result.timeframe = args[++i];
                break;
            case '--full':
                result.full = true;
                break;
        }
    }
    return result;
}
async function main() {
    const args = parseArgs();
    console.log('\n🚀 Backtest Runner Started\n');
    console.log('Configuration:', args);
    try {
        if (args.full) {
            // Run full backtest on multiple symbols
            console.log('\n📊 Running FULL backtest on multiple pairs...\n');
            const results = await (0, backtest_1.runFullBacktest)();
            console.log('\n' + '='.repeat(60));
            console.log('📈 FULL BACKTEST SUMMARY');
            console.log('='.repeat(60));
            let totalTrades = 0;
            let totalWins = 0;
            let totalProfit = 0;
            for (const [symbol, result] of Object.entries(results)) {
                totalTrades += result.totalTrades;
                totalWins += result.winningTrades;
                totalProfit += result.netProfit;
                console.log(`\n${symbol}:`);
                console.log(`  Trades: ${result.totalTrades} | Win Rate: ${result.winRate.toFixed(1)}%`);
                console.log(`  Net Profit: $${result.netProfit.toFixed(2)} | Max Drawdown: ${(result.maxDrawdownPct * 100).toFixed(2)}%`);
            }
            const overallWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
            console.log('\n' + '-'.repeat(60));
            console.log(`OVERALL:`);
            console.log(`  Total Trades: ${totalTrades}`);
            console.log(`  Win Rate: ${overallWinRate.toFixed(1)}%`);
            console.log(`  Total Profit: $${totalProfit.toFixed(2)}`);
            console.log('='.repeat(60));
            console.log('\n✅ Results saved to backtest-results.json\n');
        }
        else if (args.symbol) {
            // Run single symbol backtest
            const symbol = args.symbol.toUpperCase();
            const days = args.days || 90;
            const timeframe = args.timeframe || '60';
            console.log(`\n📊 Running backtest on ${symbol}`);
            console.log(`   Timeframe: ${timeframe}m | Days: ${days}\n`);
            const result = await (0, backtest_1.runBacktest)(symbol, timeframe, days);
            (0, backtest_1.printBacktestResults)(symbol, result);
        }
        else {
            console.error('\n❌ Error: Please specify --symbol or --full\n');
            console.log('Usage:');
            console.log('  node dist/backtest-runner.js --symbol BTCUSDT --days 90');
            console.log('  node dist/backtest-runner.js --symbol BTCUSDT --days 90 --timeframe 60');
            console.log('  node dist/backtest-runner.js --full');
            process.exit(1);
        }
    }
    catch (error) {
        console.error('\n❌ Backtest failed:', error);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=backtest-runner.js.map