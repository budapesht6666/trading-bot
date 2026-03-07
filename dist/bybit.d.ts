export interface Candle {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
export interface TickerInfo {
    symbol: string;
    volume24h: number;
    lastPrice: number;
}
export interface OrderResult {
    orderId: string;
    symbol: string;
    side: string;
    qty: number;
    price: number;
}
export interface WalletBalance {
    totalEquity: number;
    availableBalance: number;
    coin: string;
}
export declare function getTopPairs(count: number): Promise<TickerInfo[]>;
export declare function getCandles(symbol: string, interval: string, limit?: number): Promise<Candle[]>;
export declare function getWalletBalance(): Promise<WalletBalance>;
export declare function getSymbolInfo(symbol: string): Promise<{
    lotSizeFilter: {
        minOrderQty: string;
        qtyStep: string;
    };
}>;
export declare function placeOrder(symbol: string, side: 'Buy' | 'Sell', qty: number, price: number, stopLoss: number, takeProfit: number): Promise<OrderResult>;
//# sourceMappingURL=bybit.d.ts.map