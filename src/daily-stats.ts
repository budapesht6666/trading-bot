import * as fs from 'fs';
import * as path from 'path';

export interface DailyStats {
  date: string;          // YYYY-MM-DD
  trades: number;        // Number of trades today
  profit: number;        // Profit/loss today
  startedAt: string;     // ISO timestamp when trading started today
}

const STATE_FILE = path.join(__dirname, '..', 'daily-stats.json');

/**
 * Get today's stats or create new
 */
export function getDailyStats(): DailyStats {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const stats: DailyStats = JSON.parse(data);
      
      // Reset if it's a new day
      if (stats.date !== today) {
        return createNewDailyStats();
      }
      return stats;
    }
  } catch (err) {
    console.error('Error reading daily stats:', err);
  }
  
  return createNewDailyStats();
}

function createNewDailyStats(): DailyStats {
  return {
    date: new Date().toISOString().split('T')[0],
    trades: 0,
    profit: 0,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Save daily stats
 */
export function saveDailyStats(stats: DailyStats): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(stats, null, 2));
}

/**
 * Increment trade count and update profit
 */
export function recordTrade(pnl: number): DailyStats {
  const stats = getDailyStats();
  stats.trades++;
  stats.profit += pnl;
  saveDailyStats(stats);
  return stats;
}

/**
 * Check if we can open new trade today
 */
export function canTradeToday(): { allowed: boolean; reason: string } {
  const stats = getDailyStats();
  const cfg = require('./config').config.strategy;
  
  if (stats.trades >= cfg.maxTradesPerDay) {
    return { allowed: false, reason: `Max trades per day (${cfg.maxTradesPerDay}) reached` };
  }
  
  // Check drawdown
  const balance = 10000; // Would need to pass actual balance
  const drawdownPct = Math.abs(stats.profit) / balance * 100;
  if (stats.profit < 0 && drawdownPct >= cfg.maxDailyDrawdownPct) {
    return { allowed: false, reason: `Max daily drawdown (${cfg.maxDailyDrawdownPct}%) reached` };
  }
  
  return { allowed: true, reason: '' };
}
