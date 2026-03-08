"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getATR = getATR;
exports.getCurrentATR = getCurrentATR;
exports.calculateEMA = calculateEMA;
exports.getTrendDirection = getTrendDirection;
exports.calculateRSI = calculateRSI;
exports.calculateMACD = calculateMACD;
exports.getMACross = getMACross;
exports.detectMACDDivergence = detectMACDDivergence;
exports.calculateATR = calculateATR;
exports.detectDivergence = detectDivergence;
/**
 * Calculate Average True Range (ATR) indicator
 * ATR measures market volatility
 */
function getATR(candles, period = 14) {
    if (candles.length < period + 1) {
        return [];
    }
    const atr = [];
    // Calculate True Range for each candle
    // TR = max(High - Low, |High - Previous Close|, |Low - Previous Close|)
    const trueRanges = [];
    for (let i = 0; i < candles.length; i++) {
        if (i === 0) {
            // First candle: TR = High - Low
            trueRanges.push(candles[i].high - candles[i].low);
            atr.push(NaN); // Not enough data yet
        }
        else {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trueRanges.push(tr);
        }
    }
    // First ATR is Simple Moving Average of first 'period' TR values
    if (candles.length >= period) {
        let sum = 0;
        for (let i = 1; i <= period; i++) {
            sum += trueRanges[i];
        }
        const firstATR = sum / period;
        // Pad with NaN for the first 'period' values
        for (let i = 0; i < period; i++) {
            atr[i] = NaN;
        }
        atr[period] = firstATR;
        // Subsequent ATR values use Wilder's smoothing method
        // ATR = ((Prior ATR * (period - 1)) + Current TR) / period
        for (let i = period + 1; i < candles.length; i++) {
            const currentATR = ((atr[i - 1] * (period - 1)) + trueRanges[i]) / period;
            atr.push(currentATR);
        }
    }
    return atr;
}
/**
 * Get the current ATR value from the most recent candles
 */
function getCurrentATR(candles, period = 14) {
    const atrValues = getATR(candles, period);
    const validValues = atrValues.filter(v => !isNaN(v));
    if (validValues.length === 0) {
        return null;
    }
    return validValues[validValues.length - 1];
}
/**
 * Calculate Exponential Moving Average
 */
function calculateEMA(candles, period) {
    if (candles.length < period) {
        return [];
    }
    const closes = candles.map((c) => c.close);
    const ema = [];
    // First EMA is SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += closes[i];
        ema.push(NaN); // Pad before we have enough data
    }
    const multiplier = 2 / (period + 1);
    let currentEma = sum / period;
    for (let i = period; i < closes.length; i++) {
        currentEma = (closes[i] - currentEma) * multiplier + currentEma;
        ema.push(currentEma);
    }
    return ema;
}
/**
 * Check if price is above EMA (bullish trend) or below (bearish)
 */
function getTrendDirection(candles, emaPeriod) {
    const ema = calculateEMA(candles, emaPeriod);
    const validEma = ema.filter((v) => !isNaN(v));
    if (validEma.length === 0)
        return null;
    const currentPrice = candles[candles.length - 1].close;
    const currentEma = validEma[validEma.length - 1];
    if (currentPrice > currentEma)
        return 'bullish';
    if (currentPrice < currentEma)
        return 'bearish';
    return null;
}
/**
 * Calculate RSI using Wilder's smoothing method
 */
function calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) {
        return [];
    }
    const closes = candles.map((c) => c.close);
    const rsi = new Array(period).fill(NaN);
    // Initial average gain/loss
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) {
            avgGain += change;
        }
        else {
            avgLoss += Math.abs(change);
        }
    }
    avgGain /= period;
    avgLoss /= period;
    const firstRs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + firstRs));
    // Wilder's smoothing
    for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));
    }
    return rsi;
}
/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * Returns { macdLine, signalLine, histogram }
 */
function calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (candles.length < slowPeriod + signalPeriod) {
        return { macdLine: [], signalLine: [], histogram: [] };
    }
    const closes = candles.map((c) => c.close);
    // Calculate fast and slow EMAs
    const fastEMA = calculateEMA(candles, fastPeriod);
    const slowEMA = calculateEMA(candles, slowPeriod);
    // MACD Line = Fast EMA - Slow EMA
    const macdLine = [];
    const validFast = fastEMA.filter((v) => !isNaN(v));
    const validSlow = slowEMA.filter((v) => !isNaN(v));
    // Align arrays - both need valid values
    const startIdx = slowPeriod - 1;
    for (let i = startIdx; i < closes.length; i++) {
        if (!isNaN(fastEMA[i]) && !isNaN(slowEMA[i])) {
            macdLine.push(fastEMA[i] - slowEMA[i]);
        }
        else {
            macdLine.push(NaN);
        }
    }
    // Calculate Signal Line (EMA of MACD Line)
    const validMacd = macdLine.filter((v) => !isNaN(v));
    const signalLine = new Array(macdLine.length).fill(NaN);
    if (validMacd.length >= signalPeriod) {
        // Calculate EMA of MACD
        let sum = 0;
        let count = 0;
        const multiplier = 2 / (signalPeriod + 1);
        // First signal value is SMA of first signalPeriod MACD values
        for (let i = 0; i < signalPeriod; i++) {
            if (!isNaN(macdLine[startIdx + i])) {
                sum += macdLine[startIdx + i];
                count++;
            }
        }
        if (count === signalPeriod) {
            let currentSignal = sum / signalPeriod;
            // Set SMA for first signalPeriod values
            for (let i = 0; i < signalPeriod; i++) {
                signalLine[startIdx + i] = currentSignal;
            }
            // Calculate EMA for remaining
            for (let i = startIdx + signalPeriod; i < macdLine.length; i++) {
                if (!isNaN(macdLine[i])) {
                    currentSignal = (macdLine[i] - currentSignal) * multiplier + currentSignal;
                    signalLine[i] = currentSignal;
                }
            }
        }
    }
    // Histogram = MACD Line - Signal Line
    const histogram = [];
    for (let i = 0; i < macdLine.length; i++) {
        if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) {
            histogram.push(macdLine[i] - signalLine[i]);
        }
        else {
            histogram.push(NaN);
        }
    }
    return { macdLine, signalLine, histogram };
}
/**
 * Get MACD crossover direction
 * Returns 'bullish' (MACD crosses above signal), 'bearish' (MACD crosses below), or null
 */
function getMACross(candles) {
    const { macdLine, signalLine } = calculateMACD(candles);
    // Need at least 2 values to check crossover
    const validMacd = macdLine.filter((v) => !isNaN(v));
    const validSignal = signalLine.filter((v) => !isNaN(v));
    if (validMacd.length < 2 || validSignal.length < 2) {
        return null;
    }
    // Get last two valid points
    const lastIdx = macdLine.length - 1;
    const prevIdx = macdLine.length - 2;
    // Find indices where both have valid values
    let lastValid = -1, prevValid = -1;
    for (let i = lastIdx; i >= 0; i--) {
        if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) {
            if (lastValid === -1)
                lastValid = i;
            else if (prevValid === -1)
                prevValid = i;
            if (lastValid !== -1 && prevValid !== -1)
                break;
        }
    }
    if (prevValid === -1)
        return null;
    const macdNow = macdLine[lastValid];
    const macdPrev = macdLine[prevValid];
    const signalNow = signalLine[lastValid];
    const signalPrev = signalLine[prevValid];
    // Bullish: MACD was below signal, now above
    const wasBelow = macdPrev < signalPrev;
    const isAbove = macdNow > signalNow;
    // Bearish: MACD was above signal, now below
    const wasAbove = macdPrev > signalPrev;
    const isBelow = macdNow < signalNow;
    if (wasBelow && isAbove)
        return 'bullish';
    if (wasAbove && isBelow)
        return 'bearish';
    return null;
}
/**
 * Detect MACD divergence (similar to RSI divergence)
 * Price makes lower low + MACD makes higher low = bullish
 * Price makes higher high + MACD makes lower high = bearish
 */
function detectMACDDivergence(candles) {
    const { macdLine, signalLine } = calculateMACD(candles);
    if (macdLine.length < 20) {
        return { type: null, priceSwing1: 0, priceSwing2: 0, rsiSwing1: 0, rsiSwing2: 0 };
    }
    // Get valid (non-NaN) portion
    const validMacd = macdLine.filter((v) => !isNaN(v));
    const validSignal = signalLine.filter((v) => !isNaN(v));
    if (validMacd.length < 10) {
        return { type: null, priceSwing1: 0, priceSwing2: 0, rsiSwing1: 0, rsiSwing2: 0 };
    }
    // Align candles with valid MACD
    const startIdx = macdLine.findIndex((v) => !isNaN(v));
    const validCandles = candles.slice(startIdx);
    const lookWindow = Math.min(50, validCandles.length);
    const windowStart = validCandles.length - lookWindow;
    const lows = validCandles.map((c) => c.low);
    const highs = validCandles.map((c) => c.high);
    // MACD histogram for divergence (more stable than lines)
    const histogram = [];
    for (let i = startIdx; i < macdLine.length; i++) {
        if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) {
            histogram.push(macdLine[i] - signalLine[i]);
        }
    }
    if (histogram.length < 10) {
        return { type: null, priceSwing1: 0, priceSwing2: 0, rsiSwing1: 0, rsiSwing2: 0 };
    }
    const windowHist = histogram.slice(windowStart - startIdx);
    const windowLows = lows.slice(windowStart);
    const windowHighs = highs.slice(windowStart);
    // Find local minima in price and histogram for bullish divergence
    const priceLowIdx = findLocalMinima(windowLows, 3);
    const histLowIdx = findLocalMinima(windowHist, 3);
    if (priceLowIdx.length >= 2 && histLowIdx.length >= 2) {
        const lastPrice = priceLowIdx[priceLowIdx.length - 1];
        const prevPrice = priceLowIdx[priceLowIdx.length - 2];
        const lastHist = histLowIdx[histLowIdx.length - 1];
        const prevHist = histLowIdx[histLowIdx.length - 2];
        const priceLower = windowLows[lastPrice] < windowLows[prevPrice];
        const histHigher = windowHist[lastHist] > windowHist[prevHist];
        if (priceLower && histHigher) {
            // Histogram should be in relatively oversold territory (negative but rising)
            if (windowHist[lastHist] < 0 && windowHist[lastHist] > -0.5) {
                return {
                    type: 'bullish',
                    priceSwing1: windowLows[prevPrice],
                    priceSwing2: windowLows[lastPrice],
                    rsiSwing1: windowHist[prevHist],
                    rsiSwing2: windowHist[lastHist],
                };
            }
        }
    }
    // Find local maxima for bearish divergence
    const priceHighIdx = findLocalMaxima(windowHighs, 3);
    const histHighIdx = findLocalMaxima(windowHist, 3);
    if (priceHighIdx.length >= 2 && histHighIdx.length >= 2) {
        const lastPrice = priceHighIdx[priceHighIdx.length - 1];
        const prevPrice = priceHighIdx[priceHighIdx.length - 2];
        const lastHist = histHighIdx[histHighIdx.length - 1];
        const prevHist = histHighIdx[histHighIdx.length - 2];
        const priceHigher = windowHighs[lastPrice] > windowHighs[prevPrice];
        const histLower = windowHist[lastHist] < windowHist[prevHist];
        if (priceHigher && histLower) {
            // Histogram should be in relatively overbought territory (positive but falling)
            if (windowHist[lastHist] > 0 && windowHist[lastHist] < 0.5) {
                return {
                    type: 'bearish',
                    priceSwing1: windowHighs[prevPrice],
                    priceSwing2: windowHighs[lastPrice],
                    rsiSwing1: windowHist[prevHist],
                    rsiSwing2: windowHist[lastHist],
                };
            }
        }
    }
    return { type: null, priceSwing1: 0, priceSwing2: 0, rsiSwing1: 0, rsiSwing2: 0 };
}
/**
 * Find local minima indices in array
 */
function findLocalMinima(arr, lookback = 5) {
    const minima = [];
    for (let i = lookback; i < arr.length - lookback; i++) {
        let isMin = true;
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j !== i && arr[j] <= arr[i]) {
                isMin = false;
                break;
            }
        }
        if (isMin) {
            minima.push(i);
        }
    }
    return minima;
}
/**
 * Find local maxima indices in array
 */
function findLocalMaxima(arr, lookback = 5) {
    const maxima = [];
    for (let i = lookback; i < arr.length - lookback; i++) {
        let isMax = true;
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j !== i && arr[j] >= arr[i]) {
                isMax = false;
                break;
            }
        }
        if (isMax) {
            maxima.push(i);
        }
    }
    return maxima;
}
/**
 * Calculate Average True Range (ATR)
 * Uses Wilder's smoothing method
 */
function calculateATR(candles, period = 14) {
    if (candles.length < period + 1) {
        return [];
    }
    const atr = [];
    // Calculate True Range for each candle
    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trueRanges.push(tr);
    }
    // First ATR is SMA of first 'period' true ranges
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += trueRanges[i];
        atr.push(NaN); // Pad before we have enough data
    }
    let avgRange = sum / period;
    atr.push(avgRange);
    // Wilder's smoothing for remaining values
    for (let i = period; i < trueRanges.length; i++) {
        avgRange = (avgRange * (period - 1) + trueRanges[i]) / period;
        atr.push(avgRange);
    }
    return atr;
}
/**
 * Detect RSI divergence on given candles
 * Returns null if no divergence found, 'bullish' or 'bearish' otherwise
 */
function detectDivergence(candles, rsiPeriod = 14) {
    const rsiValues = calculateRSI(candles, rsiPeriod);
    if (rsiValues.length < 20) {
        return { type: null, priceSwing1: 0, priceSwing2: 0, rsiSwing1: 0, rsiSwing2: 0 };
    }
    // Use valid (non-NaN) RSI portion aligned with candles
    const validStart = candles.length - rsiValues.filter((v) => !isNaN(v)).length;
    const validRsi = rsiValues.filter((v) => !isNaN(v));
    const validCandles = candles.slice(validStart);
    const closes = validCandles.map((c) => c.close);
    const lows = validCandles.map((c) => c.low);
    const highs = validCandles.map((c) => c.high);
    // Only look at the last 50 candles to keep it relevant
    const lookWindow = Math.min(50, closes.length);
    const windowStart = closes.length - lookWindow;
    const windowLows = lows.slice(windowStart);
    const windowHighs = highs.slice(windowStart);
    const windowRsi = validRsi.slice(windowStart);
    // --- Bullish divergence: price makes lower low, RSI makes higher low ---
    const priceLowIdx = findLocalMinima(windowLows, 3);
    if (priceLowIdx.length >= 2) {
        const last = priceLowIdx[priceLowIdx.length - 1];
        const prev = priceLowIdx[priceLowIdx.length - 2];
        const priceLower = windowLows[last] < windowLows[prev];
        const rsiHigher = windowRsi[last] > windowRsi[prev];
        if (priceLower && rsiHigher) {
            // RSI not oversold extreme (between 20-50 for validity)
            if (windowRsi[last] < 55 && windowRsi[last] > 15) {
                return {
                    type: 'bullish',
                    priceSwing1: windowLows[prev],
                    priceSwing2: windowLows[last],
                    rsiSwing1: windowRsi[prev],
                    rsiSwing2: windowRsi[last],
                };
            }
        }
    }
    // --- Bearish divergence: price makes higher high, RSI makes lower high ---
    const priceHighIdx = findLocalMaxima(windowHighs, 3);
    if (priceHighIdx.length >= 2) {
        const last = priceHighIdx[priceHighIdx.length - 1];
        const prev = priceHighIdx[priceHighIdx.length - 2];
        const priceHigher = windowHighs[last] > windowHighs[prev];
        const rsiLower = windowRsi[last] < windowRsi[prev];
        if (priceHigher && rsiLower) {
            // RSI not overbought extreme (between 50-80 for validity)
            if (windowRsi[last] > 45 && windowRsi[last] < 85) {
                return {
                    type: 'bearish',
                    priceSwing1: windowHighs[prev],
                    priceSwing2: windowHighs[last],
                    rsiSwing1: windowRsi[prev],
                    rsiSwing2: windowRsi[last],
                };
            }
        }
    }
    return { type: null, priceSwing1: 0, priceSwing2: 0, rsiSwing1: 0, rsiSwing2: 0 };
}
//# sourceMappingURL=indicators.js.map