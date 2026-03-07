import { Candle } from './bybit';

/**
 * Calculate RSI using Wilder's smoothing method
 */
export function calculateRSI(candles: Candle[], period = 14): number[] {
  if (candles.length < period + 1) {
    return [];
  }

  const closes = candles.map((c) => c.close);
  const rsi: number[] = new Array(period).fill(NaN);

  // Initial average gain/loss
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain += change;
    } else {
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

export type DivergenceType = 'bullish' | 'bearish' | null;

export interface DivergenceResult {
  type: DivergenceType;
  priceSwing1: number;
  priceSwing2: number;
  rsiSwing1: number;
  rsiSwing2: number;
}

/**
 * Find local minima indices in array
 */
function findLocalMinima(arr: number[], lookback = 5): number[] {
  const minima: number[] = [];
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
function findLocalMaxima(arr: number[], lookback = 5): number[] {
  const maxima: number[] = [];
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
 * Detect RSI divergence on given candles
 * Returns null if no divergence found, 'bullish' or 'bearish' otherwise
 */
export function detectDivergence(candles: Candle[], rsiPeriod = 14): DivergenceResult {
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
