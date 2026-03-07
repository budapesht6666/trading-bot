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
/**
 * Run backtest on a single symbol
 */
export declare function runBacktest(symbol: string, timeframe: Timeframe, daysBack?: number): Promise<BacktestResult>;
/**
 * Print backtest results nicely
 */
export declare function printBacktestResults(symbol: string, result: BacktestResult): void;
//# sourceMappingURL=backtest.d.ts.map