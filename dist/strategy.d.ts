import { TickerInfo } from './bybit';
export interface TradeSignal {
    symbol: string;
    direction: 'long' | 'short';
    strength: 'weak' | 'strong';
    confirmedTimeframes: string[];
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    qty: number;
    orderId?: string;
}
/**
 * Main strategy runner — analyzes all top pairs and executes trades
 * Multi-pair mode: analyzes all pairs first, then executes best signals
 */
export declare function runStrategy(topPairs: TickerInfo[]): Promise<TradeSignal[]>;
//# sourceMappingURL=strategy.d.ts.map