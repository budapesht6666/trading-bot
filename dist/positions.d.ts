export interface OpenPosition {
    symbol: string;
    direction: 'long' | 'short';
    entryPrice: number;
    qty: number;
    orderId: string;
    openedAt: string;
}
/**
 * Load open positions from file
 */
export declare function loadPositions(): OpenPosition[];
/**
 * Save open positions to file
 */
export declare function savePositions(positions: OpenPosition[]): void;
/**
 * Check if we already have an open position for this symbol
 */
export declare function hasOpenPosition(symbol: string): boolean;
/**
 * Add a new open position
 */
export declare function addPosition(position: OpenPosition): void;
/**
 * Remove a closed position
 */
export declare function removePosition(symbol: string): void;
/**
 * Get all open positions
 */
export declare function getOpenPositions(): OpenPosition[];
/**
 * Sync local positions with Bybit — remove closed positions
 */
export declare function syncWithBybit(): Promise<void>;
//# sourceMappingURL=positions.d.ts.map