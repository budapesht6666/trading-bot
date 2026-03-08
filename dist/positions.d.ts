export interface OpenPosition {
    symbol: string;
    direction: 'long' | 'short';
    entryPrice: number;
    avgPrice: number;
    qty: number;
    totalQty: number;
    orderId: string;
    openedAt: string;
    martingaleLayers: number;
    trailingStopLoss?: number;
    trailingActivated?: boolean;
    highestProfitPct?: number;
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
 * Update an existing position
 */
export declare function updatePosition(symbol: string, updates: Partial<OpenPosition>): void;
/**
 * Add a martingale layer to existing position
 * Recalculates average price and total quantity
 */
export declare function addMartingaleLayer(symbol: string, newPrice: number, newQty: number): {
    avgPrice: number;
    totalQty: number;
    layers: number;
} | null;
/**
 * Check if price dropped enough to trigger martingale
 */
export declare function shouldAddMartingaleLayer(symbol: string, currentPrice: number): boolean;
/**
 * Get position for a symbol
 */
export declare function getPosition(symbol: string): OpenPosition | undefined;
/**
 * Get all open positions
 */
export declare function getOpenPositions(): OpenPosition[];
/**
 * Sync local positions with Bybit — remove closed positions
 */
export declare function syncWithBybit(): Promise<void>;
//# sourceMappingURL=positions.d.ts.map