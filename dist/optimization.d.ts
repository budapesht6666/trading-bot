import { Candle } from './bybit';
import { Timeframe } from './config';
export interface BacktestResult {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalProfit: number;
    totalLoss: number;
    netProfit: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
    avgWin: number;
    avgLoss: number;
    avgTrade: number;
    trades: BacktestTrade[];
}
export interface BacktestTrade {
    entryTime: number;
    exitTime: number;
    direction: 'long' | 'short';
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPct: number;
    exitReason: 'tp' | 'sl' | 'end';
}
interface OptimizationParams {
    rsiPeriod: number;
    stopLossPct: number;
    takeProfitPct: number;
}
export interface OptimizationResult extends OptimizationParams {
    totalTrades: number;
    winRate: number;
    netProfit: number;
    maxDrawdownPct: number;
}
/**
 * Run backtest with custom parameters (for optimization)
 */
export declare function runBacktestWithParams(candles: Candle[], params: OptimizationParams): Promise<BacktestResult>;
/**
 * Optimize RSI divergence strategy parameters
 */
export declare function runOptimization(symbol: string, timeframe: Timeframe, daysBack: number): Promise<OptimizationResult[]>;
/**
 * Print optimization results table
 */
export declare function printOptimizationResults(results: OptimizationResult[], topN?: number): void;
export {};
//# sourceMappingURL=optimization.d.ts.map