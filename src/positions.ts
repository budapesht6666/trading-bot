import * as fs from 'fs';
import * as path from 'path';
import { getOpenPositions as getBybitPositions, OpenPosition as BybitPosition } from './bybit';
import { config } from './config';

export interface OpenPosition {
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  avgPrice: number;             // Average price (for martingale)
  qty: number;
  totalQty: number;             // Total quantity including all layers
  orderId: string;
  openedAt: string;
  martingaleLayers: number;     // Number of martingale layers (0 = initial position)
  trailingStopLoss?: number;    // Current trailing stop loss price
  trailingActivated?: boolean;  // Whether trailing stop has been activated
  highestProfitPct?: number;    // Track highest profit percentage for trailing
}

const POSITIONS_FILE = path.join(__dirname, '..', 'positions.json');

/**
 * Load open positions from file
 */
export function loadPositions(): OpenPosition[] {
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      const data = fs.readFileSync(POSITIONS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load positions:', err);
  }
  return [];
}

/**
 * Save open positions to file
 */
export function savePositions(positions: OpenPosition[]): void {
  try {
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
  } catch (err) {
    console.error('Failed to save positions:', err);
  }
}

/**
 * Check if we already have an open position for this symbol
 */
export function hasOpenPosition(symbol: string): boolean {
  const positions = loadPositions();
  return positions.some(p => p.symbol === symbol);
}

/**
 * Add a new open position
 */
export function addPosition(position: OpenPosition): void {
  const positions = loadPositions();
  positions.push(position);
  savePositions(positions);
  console.log(`📝 Position added: ${position.symbol} ${position.direction} ${position.qty}`);
}

/**
 * Remove a closed position
 */
export function removePosition(symbol: string): void {
  const positions = loadPositions();
  const filtered = positions.filter(p => p.symbol !== symbol);
  savePositions(filtered);
  console.log(`🗑️ Position removed: ${symbol}`);
}

/**
 * Update an existing position
 */
export function updatePosition(symbol: string, updates: Partial<OpenPosition>): void {
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
export function addMartingaleLayer(
  symbol: string,
  newPrice: number,
  newQty: number
): { avgPrice: number; totalQty: number; layers: number } | null {
  const positions = loadPositions();
  const idx = positions.findIndex(p => p.symbol === symbol);
  
  if (idx === -1) {
    console.error(`Position not found for martingale: ${symbol}`);
    return null;
  }
  
  const pos = positions[idx];
  const maxLayers = config.strategy.martingaleMaxLayers || 2;
  
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
  
  console.log(
    `📈 Martingale layer ${positions[idx].martingaleLayers}/${maxLayers} for ${symbol}: ` +
    `avgPrice: ${newAvgPrice.toFixed(4)}, totalQty: ${totalQty.toFixed(6)}`
  );
  
  return {
    avgPrice: newAvgPrice,
    totalQty: totalQty,
    layers: positions[idx].martingaleLayers
  };
}

/**
 * Check if price dropped enough to trigger martingale
 */
export function shouldAddMartingaleLayer(symbol: string, currentPrice: number): boolean {
  if (!config.strategy.martingaleEnabled) {
    return false;
  }
  
  const positions = loadPositions();
  const pos = positions.find(p => p.symbol === symbol);
  
  if (!pos) {
    return false;
  }
  
  const maxLayers = config.strategy.martingaleMaxLayers || 2;
  if ((pos.martingaleLayers || 0) >= maxLayers) {
    return false;
  }
  
  const stepPct = (config.strategy.martingaleStepPct || 2) / 100;
  const direction = pos.direction;
  
  // For long: price dropped by stepPct
  // For short: price rose by stepPct
  if (direction === 'long') {
    const priceDrop = (pos.avgPrice - currentPrice) / pos.avgPrice;
    return priceDrop >= stepPct;
  } else {
    const priceRise = (currentPrice - pos.avgPrice) / pos.avgPrice;
    return priceRise >= stepPct;
  }
}

/**
 * Get position for a symbol
 */
export function getPosition(symbol: string): OpenPosition | undefined {
  const positions = loadPositions();
  return positions.find(p => p.symbol === symbol);
}

/**
 * Get all open positions
 */
export function getOpenPositions(): OpenPosition[] {
  return loadPositions();
}

/**
 * Sync local positions with Bybit — remove closed positions
 */
export async function syncWithBybit(): Promise<void> {
  try {
    const localPositions = loadPositions();
    if (localPositions.length === 0) {
      console.log('No local positions to sync');
      return;
    }

    const bybitPositions = await getBybitPositions();
    const bybitSymbols = new Set(bybitPositions.map(p => p.symbol));

    // Keep only positions that are still open on Bybit
    const syncedPositions = localPositions.filter(pos => bybitSymbols.has(pos.symbol));

    if (syncedPositions.length !== localPositions.length) {
      const removed = localPositions.length - syncedPositions.length;
      console.log(`🧹 Synced: removed ${removed} closed positions`);
      console.log(`   Kept: ${syncedPositions.map(p => p.symbol).join(', ')}`);
    }

    savePositions(syncedPositions);
  } catch (err) {
    console.error('Failed to sync with Bybit:', err);
    // Don't throw — keep local positions if Bybit is unavailable
  }
}
