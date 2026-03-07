import { BacktestResult } from './backtest';
import { Timeframe } from './config';
export interface MultiBacktestResult {
    symbol: string;
    result: BacktestResult;
}
/**
 * Run backtest on multiple trading pairs
 */
export declare function runMultiBacktest(symbols: string[], timeframe?: Timeframe, daysBack?: number): Promise<MultiBacktestResult[]>;
/**
 * Print summary table for all results
 */
export declare function printSummaryTable(results: MultiBacktestResult[]): void;
/**
 * Get TOP-N best performing pairs
 */
export declare function getTopPairs(results: MultiBacktestResult[], count?: number): MultiBacktestResult[];
/**
 * Print TOP-N pairs
 */
export declare function printTopPairs(results: MultiBacktestResult[], count?: number): void;
//# sourceMappingURL=multi-backtest.d.ts.map