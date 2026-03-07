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

import { getTopPairs } from './bybit';
import { runStrategy } from './strategy';
import { sendSignalNotification, sendErrorNotification, sendStartNotification, sendSummaryNotification } from './telegram';
import { config } from './config';
import { logger } from './logger';

async function main(): Promise<void> {
  const runOnce = process.argv.includes('--once');

  logger.info('╔══════════════════════════════════════╗');
  logger.info('║   RSI Divergence Bot — Bybit Demo    ║');
  logger.info('╚══════════════════════════════════════╝');
  logger.info(`Mode: ${runOnce ? 'single run' : 'continuous'}`);

  if (runOnce) {
    await runCycle();
    process.exit(0);
  } else {
    // Continuous mode: run every 15 minutes
    await sendStartNotification();
    while (true) {
      await runCycle();
      logger.info(`Sleeping 15 minutes until next cycle...`);
      await sleep(15 * 60 * 1000);
    }
  }
}

async function runCycle(): Promise<void> {
  const startTime = Date.now();
  logger.info(`\n⏰ Cycle started at ${new Date().toISOString()}`);

  try {
    // Step 1: Get top pairs by volume
    const topPairs = await getTopPairs(config.strategy.topPairsCount);
    logger.info(`Top pairs fetched: ${topPairs.slice(0, 5).map((p) => p.symbol).join(', ')}...`);

    // Step 2: Run divergence strategy
    const signals = await runStrategy(topPairs);

    // Step 3: Send notifications for each signal
    let notified = 0;
    for (const signal of signals) {
      try {
        await sendSignalNotification(signal);
        notified++;
      } catch (err) {
        logger.error(`Failed to send notification for ${signal.symbol}`, err);
      }
    }

    // Step 4: Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Cycle complete in ${elapsed}s | Pairs: ${topPairs.length} | Signals: ${signals.length}`);

    await sendSummaryNotification(topPairs.length, signals.length);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Fatal error in cycle', err);
    await sendErrorNotification(`Ошибка цикла: ${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run
main().catch((err) => {
  logger.error('Unhandled error in main', err);
  process.exit(1);
});
