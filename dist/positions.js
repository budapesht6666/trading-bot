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
exports.updatePosition = updatePosition;
exports.addMartingaleLayer = addMartingaleLayer;
exports.shouldAddMartingaleLayer = shouldAddMartingaleLayer;
exports.getPosition = getPosition;
exports.getOpenPositions = getOpenPositions;
exports.syncWithBybit = syncWithBybit;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const bybit_1 = require("./bybit");
const config_1 = require("./config");
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
 * Update an existing position
 */
function updatePosition(symbol, updates) {
    const positions = loadPositions();
    const idx = positions.findIndex(p => p.symbol === symbol);
    if (idx !== -1) {
        positions[idx] = { ...positions[idx], ...updates };
        savePositions(positions);
    }
}
/**
 * Add a martingale layer to existing position
 * Recalculates average price and total quantity
 */
function addMartingaleLayer(symbol, newPrice, newQty) {
    const positions = loadPositions();
    const idx = positions.findIndex(p => p.symbol === symbol);
    if (idx === -1) {
        console.error(`Position not found for martingale: ${symbol}`);
        return null;
    }
    const pos = positions[idx];
    const maxLayers = config_1.config.strategy.martingaleMaxLayers || 2;
    if (pos.martingaleLayers >= maxLayers) {
        console.log(`Max martingale layers reached for ${symbol} (${maxLayers})`);
        return null;
    }
    // Calculate new average price using weighted average
    const totalValue = (pos.avgPrice * pos.totalQty) + (newPrice * newQty);
    const totalQty = pos.totalQty + newQty;
    const newAvgPrice = totalValue / totalQty;
    // Update position
    positions[idx].avgPrice = newAvgPrice;
    positions[idx].totalQty = totalQty;
    positions[idx].martingaleLayers = (pos.martingaleLayers || 0) + 1;
    savePositions(positions);
    console.log(`📈 Martingale layer ${positions[idx].martingaleLayers}/${maxLayers} for ${symbol}: ` +
        `avgPrice: ${newAvgPrice.toFixed(4)}, totalQty: ${totalQty.toFixed(6)}`);
    return {
        avgPrice: newAvgPrice,
        totalQty: totalQty,
        layers: positions[idx].martingaleLayers
    };
}
/**
 * Check if price dropped enough to trigger martingale
 */
function shouldAddMartingaleLayer(symbol, currentPrice) {
    if (!config_1.config.strategy.martingaleEnabled) {
        return false;
    }
    const positions = loadPositions();
    const pos = positions.find(p => p.symbol === symbol);
    if (!pos) {
        return false;
    }
    const maxLayers = config_1.config.strategy.martingaleMaxLayers || 2;
    if ((pos.martingaleLayers || 0) >= maxLayers) {
        return false;
    }
    const stepPct = (config_1.config.strategy.martingaleStepPct || 2) / 100;
    const direction = pos.direction;
    // For long: price dropped by stepPct
    // For short: price rose by stepPct
    if (direction === 'long') {
        const priceDrop = (pos.avgPrice - currentPrice) / pos.avgPrice;
        return priceDrop >= stepPct;
    }
    else {
        const priceRise = (currentPrice - pos.avgPrice) / pos.avgPrice;
        return priceRise >= stepPct;
    }
}
/**
 * Get position for a symbol
 */
function getPosition(symbol) {
    const positions = loadPositions();
    return positions.find(p => p.symbol === symbol);
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