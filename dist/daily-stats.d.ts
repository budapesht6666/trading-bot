export interface DailyStats {
    date: string;
    trades: number;
    profit: number;
    startedAt: string;
}
/**
 * Get today's stats or create new
 */
export declare function getDailyStats(): DailyStats;
/**
 * Save daily stats
 */
export declare function saveDailyStats(stats: DailyStats): void;
/**
 * Increment trade count and update profit
 */
export declare function recordTrade(pnl: number): DailyStats;
/**
 * Check if we can open new trade today
 */
export declare function canTradeToday(): {
    allowed: boolean;
    reason: string;
};
//# sourceMappingURL=daily-stats.d.ts.map