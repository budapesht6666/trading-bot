import { Candle } from './bybit';
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
/**
 * Detect RSI divergence on given candles
 * Returns null if no divergence found, 'bullish' or 'bearish' otherwise
 */
export declare function detectDivergence(candles: Candle[], rsiPeriod?: number): DivergenceResult;
//# sourceMappingURL=indicators.d.ts.map