import { Candle } from './bybit';
/**
 * Calculate Average True Range (ATR) indicator
 * ATR measures market volatility
 */
export declare function getATR(candles: Candle[], period?: number): number[];
/**
 * Calculate Exponential Moving Average
 */
export declare function calculateEMA(candles: Candle[], period: number): number[];
/**
 * Check if price is above EMA (bullish trend) or below (bearish)
 */
export declare function getTrendDirection(candles: Candle[], emaPeriod: number): 'bullish' | 'bearish' | null;
/**
 * Calculate RSI using Wilder's smoothing method
 */
export declare function calculateRSI(candles: Candle[], period?: number): number[];
export type DivergenceType = 'bullish' | 'bearish' | null;
export interface DivergenceResult {
    type: DivergenceType;
    priceSwing1: number;
    priceSwing2: number;
    rsiSwing1: number;
    rsiSwing2: number;
}
export interface MACDResult {
    macdLine: number[];
    signalLine: number[];
    histogram: number[];
}
/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * Returns { macdLine, signalLine, histogram }
 */
export declare function calculateMACD(candles: Candle[], fastPeriod?: number, slowPeriod?: number, signalPeriod?: number): MACDResult;
export type MACDCrossType = 'bullish' | 'bearish' | null;
/**
 * Get MACD crossover direction
 * Returns 'bullish' (MACD crosses above signal), 'bearish' (MACD crosses below), or null
 */
export declare function getMACross(candles: Candle[]): MACDCrossType;
/**
 * Detect MACD divergence (similar to RSI divergence)
 * Price makes lower low + MACD makes higher low = bullish
 * Price makes higher high + MACD makes lower high = bearish
 */
export declare function detectMACDDivergence(candles: Candle[]): DivergenceResult;
/**
 * Calculate Average True Range (ATR)
 * Uses Wilder's smoothing method
 */
export declare function calculateATR(candles: Candle[], period?: number): number[];
/**
 * Detect RSI divergence on given candles
 * Returns null if no divergence found, 'bullish' or 'bearish' otherwise
 */
export declare function detectDivergence(candles: Candle[], rsiPeriod?: number): DivergenceResult;
//# sourceMappingURL=indicators.d.ts.map