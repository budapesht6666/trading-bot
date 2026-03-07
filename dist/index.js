"use strict";
/**
 * RSI Divergence Trading Bot for Bybit Demo
 *
 * Entry point. Can be run:
 *   - Once: `node dist/index.js --once`
 *   - As cron: schedule this script via crontab (e.g., every 15 minutes)
 *
 * Recommended crontab (every 15 min):
 *   * /15 * * * * cd /home/dorozhkin/trading-bot && node dist/index.js --once >> /var/log/trading-bot.log 2>&1
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bybit_1 = require("./bybit");
const strategy_1 = require("./strategy");
const telegram_1 = require("./telegram");
const config_1 = require("./config");
const logger_1 = require("./logger");
const positions_1 = require("./positions");
const backtest_1 = require("./backtest");
async function main() {
    const runOnce = process.argv.includes('--once');
    const runBacktestCli = process.argv.includes('--backtest');
    logger_1.logger.info('╔══════════════════════════════════════╗');
    logger_1.logger.info('║   RSI Divergence Bot — Bybit Demo    ║');
    logger_1.logger.info('╚══════════════════════════════════════╝');
    logger_1.logger.info(`Mode: ${runOnce ? 'single run' : runBacktestCli ? 'backtest' : 'continuous'}`);
    if (runBacktestCli) {
        await runBacktestCLI();
        process.exit(0);
    }
    else if (runOnce) {
        await runCycle();
        process.exit(0);
    }
    else {
        // Continuous mode: run every 15 minutes
        await (0, telegram_1.sendStartNotification)();
        while (true) {
            await runCycle();
            logger_1.logger.info(`Sleeping 15 minutes until next cycle...`);
            await sleep(15 * 60 * 1000);
        }
    }
}
async function runCycle() {
    const startTime = Date.now();
    logger_1.logger.info(`\n⏰ Cycle started at ${new Date().toISOString()}`);
    try {
        // Step 0: Sync positions with Bybit (remove closed positions)
        await (0, positions_1.syncWithBybit)();
        // Step 1: Get top pairs by volume
        const topPairs = await (0, bybit_1.getTopPairs)(config_1.config.strategy.topPairsCount);
        logger_1.logger.info(`Top pairs fetched: ${topPairs.slice(0, 5).map((p) => p.symbol).join(', ')}...`);
        // Step 2: Run divergence strategy
        const signals = await (0, strategy_1.runStrategy)(topPairs);
        // Step 3: Send notifications for each signal
        let notified = 0;
        for (const signal of signals) {
            try {
                await (0, telegram_1.sendSignalNotification)(signal);
                notified++;
            }
            catch (err) {
                logger_1.logger.error(`Failed to send notification for ${signal.symbol}`, err);
            }
        }
        // Step 4: Summary
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger_1.logger.info(`Cycle complete in ${elapsed}s | Pairs: ${topPairs.length} | Signals: ${signals.length}`);
        await (0, telegram_1.sendSummaryNotification)(topPairs.length, signals.length);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error('Fatal error in cycle', err);
        await (0, telegram_1.sendErrorNotification)(`Ошибка цикла: ${message}`);
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function runBacktestCLI() {
    // Parse args: --backtest SYMBOL [TIMEFRAME] [DAYS]
    const args = process.argv.slice(2);
    const symbol = args[1] || 'BTCUSDT';
    const timeframe = args[2] || '60';
    const days = parseInt(args[3]) || 180;
    logger_1.logger.info(`\n🚀 Starting backtest: ${symbol} ${timeframe}m ${days} days`);
    try {
        const result = await (0, backtest_1.runBacktest)(symbol, timeframe, days);
        (0, backtest_1.printBacktestResults)(symbol, result);
    }
    catch (err) {
        logger_1.logger.error('Backtest failed', err);
        process.exit(1);
    }
}
// Run
main().catch((err) => {
    logger_1.logger.error('Unhandled error in main', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map