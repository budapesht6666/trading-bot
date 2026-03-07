import * as fs from 'fs';
import * as path from 'path';

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
