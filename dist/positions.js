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
exports.loadPositions = loadPositions;
exports.savePositions = savePositions;
exports.hasOpenPosition = hasOpenPosition;
exports.addPosition = addPosition;
exports.removePosition = removePosition;
exports.getOpenPositions = getOpenPositions;
exports.syncWithBybit = syncWithBybit;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const bybit_1 = require("./bybit");
const POSITIONS_FILE = path.join(__dirname, '..', 'positions.json');
/**
 * Load open positions from file
 */
function loadPositions() {
    try {
        if (fs.existsSync(POSITIONS_FILE)) {
            const data = fs.readFileSync(POSITIONS_FILE, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (err) {
        console.error('Failed to load positions:', err);
    }
    return [];
}
/**
 * Save open positions to file
 */
function savePositions(positions) {
    try {
        fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
    }
    catch (err) {
        console.error('Failed to save positions:', err);
    }
}
/**
 * Check if we already have an open position for this symbol
 */
function hasOpenPosition(symbol) {
    const positions = loadPositions();
    return positions.some(p => p.symbol === symbol);
}
/**
 * Add a new open position
 */
function addPosition(position) {
    const positions = loadPositions();
    positions.push(position);
    savePositions(positions);
    console.log(`📝 Position added: ${position.symbol} ${position.direction} ${position.qty}`);
}
/**
 * Remove a closed position
 */
function removePosition(symbol) {
    const positions = loadPositions();
    const filtered = positions.filter(p => p.symbol !== symbol);
    savePositions(filtered);
    console.log(`🗑️ Position removed: ${symbol}`);
}
/**
 * Get all open positions
 */
function getOpenPositions() {
    return loadPositions();
}
/**
 * Sync local positions with Bybit — remove closed positions
 */
async function syncWithBybit() {
    try {
        const localPositions = loadPositions();
        if (localPositions.length === 0) {
            console.log('No local positions to sync');
            return;
        }
        const bybitPositions = await (0, bybit_1.getOpenPositions)();
        const bybitSymbols = new Set(bybitPositions.map(p => p.symbol));
        // Keep only positions that are still open on Bybit
        const syncedPositions = localPositions.filter(pos => bybitSymbols.has(pos.symbol));
        if (syncedPositions.length !== localPositions.length) {
            const removed = localPositions.length - syncedPositions.length;
            console.log(`🧹 Synced: removed ${removed} closed positions`);
            console.log(`   Kept: ${syncedPositions.map(p => p.symbol).join(', ')}`);
        }
        savePositions(syncedPositions);
    }
    catch (err) {
        console.error('Failed to sync with Bybit:', err);
        // Don't throw — keep local positions if Bybit is unavailable
    }
}
//# sourceMappingURL=positions.js.map