"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyStats = getDailyStats;
exports.saveDailyStats = saveDailyStats;
exports.recordTrade = recordTrade;
exports.canTradeToday = canTradeToday;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const STATE_FILE = path.join(__dirname, '..', 'daily-stats.json');
/**
 * Get today's stats or create new
 */
function getDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf-8');
            const stats = JSON.parse(data);
            // Reset if it's a new day
            if (stats.date !== today) {
                return createNewDailyStats();
            }
            return stats;
        }
    }
    catch (err) {
        console.error('Error reading daily stats:', err);
    }
    return createNewDailyStats();
}
function createNewDailyStats() {
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
function saveDailyStats(stats) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(stats, null, 2));
}
/**
 * Increment trade count and update profit
 */
function recordTrade(pnl) {
    const stats = getDailyStats();
    stats.trades++;
    stats.profit += pnl;
    saveDailyStats(stats);
    return stats;
}
/**
 * Check if we can open new trade today
 */
function canTradeToday() {
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
//# sourceMappingURL=daily-stats.js.map