import * as fs from 'fs';
import * as path from 'path';
import { getOpenPositions as getBybitPositions, OpenPosition as BybitPosition } from './bybit';

export interface OpenPosition {
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  qty: number;
  orderId: string;
  openedAt: string;
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
