"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStrategy = runStrategy;
const bybit_1 = require("./bybit");
const indicators_1 = require("./indicators");
const config_1 = require("./config");
const logger_1 = require("./logger");
/**
 * Analyze a single symbol across all configured timeframes
 */
async function analyzeSymbol(symbol) {
    const timeframes = config_1.config.strategy.timeframes;
    const analyses = [];
    for (const tf of timeframes) {
        try {
            const candles = await (0, bybit_1.getCandles)(symbol, tf, config_1.config.strategy.candlesLookback);
            const divergence = (0, indicators_1.detectDivergence)(candles, config_1.config.strategy.rsiPeriod);
            if (divergence.type) {
                logger_1.logger.info(`  ${symbol} ${tf}m: ${divergence.type} divergence | ` +
                    `Price: ${divergence.priceSwing1.toFixed(4)} → ${divergence.priceSwing2.toFixed(4)} | ` +
                    `RSI: ${divergence.rsiSwing1.toFixed(1)} → ${divergence.rsiSwing2.toFixed(1)}`);
            }
            analyses.push({ timeframe: tf, divergenceType: divergence.type });
        }
        catch (err) {
            logger_1.logger.warn(`Failed to analyze ${symbol} on ${tf}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    // Count confirmations per direction
    const bullishTfs = analyses
        .filter((a) => a.divergenceType === 'bullish')
        .map((a) => a.timeframe);
    const bearishTfs = analyses
        .filter((a) => a.divergenceType === 'bearish')
        .map((a) => a.timeframe);
    const minTfs = config_1.config.strategy.minTimeframesForEntry;
    let confirmedTfs = [];
    let direction = null;
    if (bullishTfs.length >= minTfs && bullishTfs.length >= bearishTfs.length) {
        direction = 'long';
        confirmedTfs = bullishTfs;
    }
    else if (bearishTfs.length >= minTfs && bearishTfs.length > bullishTfs.length) {
        direction = 'short';
        confirmedTfs = bearishTfs;
    }
    if (!direction) {
        return null;
    }
    const strength = confirmedTfs.length >= 3 ? 'strong' : 'weak';
    // Get current price (use last candle close from 15m)
    const recentCandles = await (0, bybit_1.getCandles)(symbol, '15', 1);
    const currentPrice = recentCandles[recentCandles.length - 1]?.close || 0;
    if (!currentPrice) {
        logger_1.logger.warn(`Could not get current price for ${symbol}`);
        return null;
    }
    // Calculate TP/SL
    const slPct = config_1.config.strategy.stopLossPct / 100;
    const tpPct = config_1.config.strategy.takeProfitPct / 100;
    const stopLoss = direction === 'long'
        ? currentPrice * (1 - slPct)
        : currentPrice * (1 + slPct);
    const takeProfit = direction === 'long'
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
async function calculatePositionSize(entryPrice) {
    const balance = await (0, bybit_1.getWalletBalance)();
    const positionUsd = (balance.totalEquity * config_1.config.strategy.positionSizePct) / 100;
    const qty = positionUsd / entryPrice;
    logger_1.logger.info(`Balance: $${balance.totalEquity.toFixed(2)} | Position: $${positionUsd.toFixed(2)} | Qty: ${qty.toFixed(6)}`);
    return qty;
}
/**
 * Execute a trade signal
 */
async function executeTrade(signal) {
    const side = signal.direction === 'long' ? 'Buy' : 'Sell';
    try {
        const result = await (0, bybit_1.placeOrder)(signal.symbol, side, signal.qty, signal.entryPrice, signal.stopLoss, signal.takeProfit);
        logger_1.logger.info(`Order placed: ${result.orderId} for ${signal.symbol}`);
        return { ...signal, orderId: result.orderId };
    }
    catch (err) {
        logger_1.logger.error(`Failed to place order for ${signal.symbol}`, err);
        throw err;
    }
}
/**
 * Main strategy runner — analyzes all top pairs and executes trades
 */
async function runStrategy(topPairs) {
    const signals = [];
    const executedSymbols = new Set();
    logger_1.logger.info(`\n${'='.repeat(60)}`);
    logger_1.logger.info(`Analyzing ${topPairs.length} pairs for RSI divergence...`);
    logger_1.logger.info(`${'='.repeat(60)}`);
    // Fetch balance once upfront
    let balance = null;
    try {
        balance = await (0, bybit_1.getWalletBalance)();
        logger_1.logger.info(`Account balance: $${balance.totalEquity.toFixed(2)} USDT`);
    }
    catch (err) {
        logger_1.logger.error('Could not fetch balance', err);
        // Continue analysis even without balance (won't place orders)
    }
    for (const pair of topPairs) {
        if (executedSymbols.has(pair.symbol))
            continue;
        logger_1.logger.info(`\nAnalyzing ${pair.symbol} (vol24h: $${(pair.volume24h / 1e6).toFixed(1)}M)`);
        try {
            const signal = await analyzeSymbol(pair.symbol);
            if (!signal) {
                logger_1.logger.info(`  ${pair.symbol}: No divergence signal`);
                continue;
            }
            logger_1.logger.info(`  ✨ SIGNAL: ${signal.direction.toUpperCase()} | ` +
                `TFs: ${signal.confirmedTimeframes.join(',')} | Strength: ${signal.strength}`);
            // Calculate position size
            if (balance) {
                const positionUsd = (balance.totalEquity * config_1.config.strategy.positionSizePct) / 100;
                signal.qty = positionUsd / signal.entryPrice;
            }
            else {
                logger_1.logger.warn('Skipping trade execution: no balance info');
                signals.push(signal);
                continue;
            }
            // Execute trade
            try {
                const executed = await executeTrade(signal);
                signals.push(executed);
                executedSymbols.add(pair.symbol);
                logger_1.logger.info(`  ✅ Trade executed: ${executed.orderId}`);
            }
            catch (err) {
                logger_1.logger.error(`  ❌ Trade failed for ${signal.symbol}`, err);
                // Still include signal (without orderId) for notifications
                signals.push(signal);
            }
        }
        catch (err) {
            logger_1.logger.error(`Error analyzing ${pair.symbol}`, err);
        }
        // Small delay between pairs to avoid hammering SSH
        await sleep(500);
    }
    logger_1.logger.info(`\n${'='.repeat(60)}`);
    logger_1.logger.info(`Strategy complete. Signals found: ${signals.length}`);
    logger_1.logger.info(`${'='.repeat(60)}\n`);
    return signals;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=strategy.js.map