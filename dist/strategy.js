"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStrategy = runStrategy;
const bybit_1 = require("./bybit");
const indicators_1 = require("./indicators");
const config_1 = require("./config");
const logger_1 = require("./logger");
const positions_1 = require("./positions");
const daily_stats_1 = require("./daily-stats");
/**
 * Get current price for a symbol (used for trend filter)
 */
async function getCurrentPrice(symbol) {
    try {
        const candles = await (0, bybit_1.getCandles)(symbol, '15', 1);
        return candles[candles.length - 1]?.close || null;
    }
    catch {
        return null;
    }
}
/**
 * Check trend filter - returns allowed directions based on BTC/ETH prices
 */
async function getAllowedDirections() {
    const result = { long: true, short: true };
    if (!config_1.config.strategy.trendFilterEnabled) {
        return result;
    }
    const btcPrice = await getCurrentPrice('BTCUSDT');
    const ethPrice = await getCurrentPrice('ETHUSDT');
    if (btcPrice && btcPrice >= config_1.config.strategy.minBtcForLong) {
        logger_1.logger.info(`📈 Trend filter: BTC ($${btcPrice.toLocaleString()}) >= $${config_1.config.strategy.minBtcForLong.toLocaleString()} → only LONGS`);
        result.short = false;
    }
    if (ethPrice && ethPrice >= config_1.config.strategy.minEthForLong) {
        logger_1.logger.info(`📈 Trend filter: ETH ($${ethPrice.toLocaleString()}) >= $${config_1.config.strategy.minEthForLong.toLocaleString()} → only LONGS`);
        result.short = false;
    }
    if (!result.short) {
        logger_1.logger.info(`  🚫 Short trades blocked by trend filter`);
    }
    return result;
}
/**
 * Check if symbol is a focus pair
 */
function isFocusPair(symbol) {
    return config_1.config.strategy.focusPairs.includes(symbol);
}
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
            // MACD confirmation check
            let macdConfirmed = false;
            if (divergence.type) {
                const macdDivergence = (0, indicators_1.detectMACDDivergence)(candles);
                const macdCross = (0, indicators_1.getMACross)(candles);
                // MACD confirms if: divergence in same direction OR crossover in same direction
                const macdDivMatch = macdDivergence.type === divergence.type;
                const macdCrossMatch = macdCross === divergence.type;
                macdConfirmed = macdDivMatch || macdCrossMatch;
                if (macdConfirmed) {
                    logger_1.logger.info(`  ${symbol} ${tf}m: RSI ${divergence.type} + MACD confirmed | ` +
                        `MACD div: ${macdDivergence.type || 'none'}, Cross: ${macdCross || 'none'}`);
                }
            }
            if (divergence.type) {
                logger_1.logger.info(`  ${symbol} ${tf}m: ${divergence.type} divergence | ` +
                    `Price: ${divergence.priceSwing1.toFixed(4)} → ${divergence.priceSwing2.toFixed(4)} | ` +
                    `RSI: ${divergence.rsiSwing1.toFixed(1)} → ${divergence.rsiSwing2.toFixed(1)}`);
            }
            analyses.push({ timeframe: tf, divergenceType: divergence.type, macdConfirmed });
        }
        catch (err) {
            logger_1.logger.warn(`Failed to analyze ${symbol} on ${tf}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    // Count confirmations per direction (only those with MACD confirmation)
    const bullishTfs = analyses
        .filter((a) => a.divergenceType === 'bullish' && a.macdConfirmed)
        .map((a) => a.timeframe);
    const bearishTfs = analyses
        .filter((a) => a.divergenceType === 'bearish' && a.macdConfirmed)
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
    // --- MACD Confirmation Filter ---
    try {
        const macdCandles = await (0, bybit_1.getCandles)(symbol, '60', 50);
        const macross = (0, indicators_1.getMACross)(macdCandles);
        // Require MACD confirmation: cross in same direction as RSI signal
        const macdConfirm = direction === 'long' && macross === 'bullish' ||
            direction === 'short' && macross === 'bearish';
        if (!macdConfirm) {
            logger_1.logger.info(`  ${symbol}: Skipping ${direction} — no MACD confirmation (${macross})`);
            return null;
        }
        logger_1.logger.info(`  ${symbol}: MACD confirms ${direction} signal`);
    }
    catch (err) {
        logger_1.logger.warn(`Could not check MACD for ${symbol}: ${err}`);
    }
    // NOTE: EMA trend filter removed - it was blocking too many trades
    // RSI divergence predicts reversal, so filtering by trend was counterproductive
    const strength = confirmedTfs.length >= 3 ? 'strong' : 'weak';
    // Apply trend filter - block shorts if trend is bullish
    const allowedDirs = await getAllowedDirections();
    if (!allowedDirs[direction]) {
        logger_1.logger.info(`  ${symbol}: ${direction.toUpperCase()} blocked by trend filter`);
        return null;
    }
    // Boost strength for focus pairs (+1 level)
    const finalStrength = isFocusPair(symbol) && strength === 'weak' ? 'strong' : strength;
    if (isFocusPair(symbol) && finalStrength !== strength) {
        logger_1.logger.info(`  ${symbol}: Focus pair boosted strength: ${strength} → ${finalStrength}`);
    }
    // Get current price and ATR (use last candle close from 15m)
    const recentCandles = await (0, bybit_1.getCandles)(symbol, '15', Math.max(config_1.config.strategy.atrPeriod + 10, config_1.config.strategy.candlesLookback));
    const currentPrice = recentCandles[recentCandles.length - 1]?.close || 0;
    if (!currentPrice) {
        logger_1.logger.warn(`Could not get current price for ${symbol}`);
        return null;
    }
    // Calculate ATR-based TP/SL
    const atr = (0, indicators_1.getCurrentATR)(recentCandles, config_1.config.strategy.atrPeriod);
    const atrMultiplierSL = config_1.config.strategy.atrMultiplierSL;
    const atrMultiplierTP = config_1.config.strategy.atrMultiplierTP;
    const slATR = atr ? atr * atrMultiplierSL : null;
    const tpATR = atr ? atr * atrMultiplierTP : null;
    let stopLoss;
    let takeProfit;
    // Use ATR if available, otherwise fall back to percentage-based
    if (atr && slATR && tpATR) {
        stopLoss = direction === 'long' ? currentPrice - slATR : currentPrice + slATR;
        takeProfit = direction === 'long' ? currentPrice + tpATR : currentPrice - tpATR;
        logger_1.logger.info(`  📊 Using ATR-based SL/TP: SL=${slATR.toFixed(4)} (${atrMultiplierSL}x), TP=${tpATR.toFixed(4)} (${atrMultiplierTP}x)`);
    }
    else {
        // Fallback to percentage-based if ATR fails
        logger_1.logger.warn(`  ⚠️ ATR unavailable, using percentage-based SL/TP`);
        const slPct = config_1.config.strategy.stopLossPct / 100;
        const tpPct = config_1.config.strategy.takeProfitPct / 100;
        stopLoss = direction === 'long' ? currentPrice * (1 - slPct) : currentPrice * (1 + slPct);
        takeProfit = direction === 'long' ? currentPrice * (1 + tpPct) : currentPrice * (1 - tpPct);
    }
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
 * Check and update trailing stops for all open positions
 * Trailing stop activates when profit reaches trailingActivationPct%
 * Then moves SL on every trailingStepPct% increase in profit
 * Minimum SL = entry price
 */
async function checkTrailingStops() {
    const positions = (0, positions_1.loadPositions)();
    if (positions.length === 0)
        return;
    const activationPct = config_1.config.strategy.trailingActivationPct / 100;
    const stepPct = config_1.config.strategy.trailingStepPct / 100;
    for (const pos of positions) {
        try {
            // Get current price
            const candles = await (0, bybit_1.getCandles)(pos.symbol, '15', 1);
            const currentPrice = candles[0]?.close;
            if (!currentPrice)
                continue;
            // Calculate current profit percentage
            let profitPct;
            if (pos.direction === 'long') {
                profitPct = (currentPrice - pos.entryPrice) / pos.entryPrice;
            }
            else {
                profitPct = (pos.entryPrice - currentPrice) / pos.entryPrice;
            }
            // Initialize trailing tracking if not set
            if (!pos.trailingActivated || pos.highestProfitPct === undefined) {
                (0, positions_1.updatePosition)(pos.symbol, {
                    trailingActivated: false,
                    highestProfitPct: profitPct,
                    trailingStopLoss: pos.trailingStopLoss || (pos.direction === 'long'
                        ? pos.entryPrice * (1 - config_1.config.strategy.stopLossPct / 100)
                        : pos.entryPrice * (1 + config_1.config.strategy.stopLossPct / 100))
                });
                continue;
            }
            // Update highest profit reached
            if (profitPct > pos.highestProfitPct) {
                (0, positions_1.updatePosition)(pos.symbol, { highestProfitPct: profitPct });
            }
            const highestProfit = pos.highestProfitPct;
            // Check if trailing should activate
            if (!pos.trailingActivated && profitPct >= activationPct) {
                // Activate trailing stop - move SL to entry price
                const newSL = pos.entryPrice;
                (0, positions_1.updatePosition)(pos.symbol, {
                    trailingActivated: true,
                    trailingStopLoss: newSL
                });
                logger_1.logger.info(`  🔒 Trailing stop ACTIVATED for ${pos.symbol}: SL moved to entry ${pos.entryPrice.toFixed(4)}`);
                continue;
            }
            // If trailing is active, move SL on each step
            if (pos.trailingActivated) {
                // Calculate how many steps we've moved up from activation
                const profitFromActivation = highestProfit - activationPct;
                const steps = Math.floor(profitFromActivation / stepPct);
                // New SL = entry + (steps * stepPct * entry)
                let newSL;
                if (pos.direction === 'long') {
                    newSL = pos.entryPrice * (1 + steps * stepPct);
                }
                else {
                    newSL = pos.entryPrice * (1 - steps * stepPct);
                }
                // Ensure new SL is higher than current SL and not below entry
                const minSL = pos.entryPrice;
                const currentSL = pos.trailingStopLoss || 0;
                let shouldUpdate = false;
                if (pos.direction === 'long' && newSL > currentSL && newSL >= minSL) {
                    shouldUpdate = true;
                }
                else if (pos.direction === 'short' && newSL < currentSL && newSL <= minSL) {
                    shouldUpdate = true;
                }
                if (shouldUpdate) {
                    (0, positions_1.updatePosition)(pos.symbol, { trailingStopLoss: newSL });
                    logger_1.logger.info(`  📈 Trailing stop updated for ${pos.symbol}: SL moved to ${newSL.toFixed(4)} (profit: ${(profitPct * 100).toFixed(2)}%)`);
                }
            }
        }
        catch (err) {
            logger_1.logger.error(`Error checking trailing stop for ${pos.symbol}`, err);
        }
    }
}
/**
 * Main strategy runner — analyzes all top pairs and executes trades
 * Multi-pair mode: analyzes all pairs first, then executes best signals
 */
async function runStrategy(topPairs) {
    // Check daily limits
    const daily = (0, daily_stats_1.getDailyStats)();
    const tradeCheck = (0, daily_stats_1.canTradeToday)();
    if (!tradeCheck.allowed) {
        logger_1.logger.info(`🚫 Cannot trade today: ${tradeCheck.reason}`);
        logger_1.logger.info(`   Daily stats: ${daily.trades} trades, $${daily.profit.toFixed(2)} P/L`);
        return [];
    }
    // Check and update trailing stops for existing positions
    await checkTrailingStops();
    // Load current positions to know available slots
    const openPositions = (0, positions_1.loadPositions)();
    const currentPositions = openPositions.length;
    const maxPositions = config_1.config.strategy.maxConcurrentPositions;
    const availableSlots = Math.max(0, maxPositions - currentPositions);
    logger_1.logger.info(`\n${'='.repeat(60)}`);
    logger_1.logger.info(`Analyzing ${topPairs.length} pairs for RSI divergence...`);
    logger_1.logger.info(`📊 Daily: ${daily.trades}/${config_1.config.strategy.maxTradesPerDay} trades | ` +
        `Positions: ${currentPositions}/${maxPositions} open`);
    logger_1.logger.info(`${'='.repeat(60)}`);
    // Fetch balance once upfront
    let balance = null;
    try {
        balance = await (0, bybit_1.getWalletBalance)();
        logger_1.logger.info(`Account balance: $${balance.totalEquity.toFixed(2)} USDT`);
    }
    catch (err) {
        logger_1.logger.error('Could not fetch balance', err);
    }
    // Phase 1: Collect ALL signals (don't execute yet)
    const pendingSignals = [];
    for (const pair of topPairs) {
        // Skip if already have position
        if ((0, positions_1.hasOpenPosition)(pair.symbol))
            continue;
        logger_1.logger.info(`\nAnalyzing ${pair.symbol} (vol24h: $${(pair.volume24h / 1e6).toFixed(1)}M)`);
        try {
            const signal = await analyzeSymbol(pair.symbol);
            if (!signal) {
                continue;
            }
            logger_1.logger.info(`  ✨ SIGNAL: ${signal.direction.toUpperCase()} | ` +
                `TFs: ${signal.confirmedTimeframes.join(',')} | Strength: ${signal.strength}`);
            // Calculate position size
            if (balance) {
                const positionUsd = (balance.totalEquity * config_1.config.strategy.positionSizePct) / 100;
                signal.qty = positionUsd / signal.entryPrice;
            }
            pendingSignals.push(signal);
        }
        catch (err) {
            logger_1.logger.error(`Error analyzing ${pair.symbol}`, err);
        }
        // Small delay between pairs
        await sleep(300);
    }
    // Phase 2: Execute best signals based on available slots
    const signals = [];
    if (pendingSignals.length > 0) {
        // Sort by strength (strong > weak)
        pendingSignals.sort((a, b) => {
            const strengthOrder = { strong: 2, weak: 1 };
            return strengthOrder[b.strength] - strengthOrder[a.strength];
        });
        const toExecute = pendingSignals.slice(0, availableSlots);
        logger_1.logger.info(`\n📋 Found ${pendingSignals.length} signals, executing ${toExecute.length}...`);
        for (const signal of toExecute) {
            // Check trade limit again
            const check = (0, daily_stats_1.canTradeToday)();
            if (!check.allowed) {
                logger_1.logger.info(`  ⏹️ Daily limit reached, stopping execution`);
                break;
            }
            try {
                const executed = await executeTrade(signal);
                // Save position
                const position = {
                    symbol: executed.symbol,
                    direction: executed.direction,
                    entryPrice: executed.entryPrice,
                    qty: executed.qty,
                    orderId: executed.orderId,
                    openedAt: new Date().toISOString(),
                };
                (0, positions_1.addPosition)(position);
                // Record trade in daily stats
                (0, daily_stats_1.recordTrade)(0); // PnL will be calculated when position closes
                signals.push(executed);
                logger_1.logger.info(`  ✅ Trade executed: ${executed.orderId}`);
            }
            catch (err) {
                logger_1.logger.error(`  ❌ Trade failed for ${signal.symbol}`, err);
                signals.push(signal);
            }
        }
    }
    logger_1.logger.info(`\n${'='.repeat(60)}`);
    logger_1.logger.info(`Strategy complete. Trades executed: ${signals.length}/${pendingSignals.length}`);
    logger_1.logger.info(`${'='.repeat(60)}\n`);
    return signals;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=strategy.js.map