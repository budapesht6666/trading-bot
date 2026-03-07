export declare const config: {
    bybit: {
        apiKey: string;
        apiSecret: string;
        baseUrl: string;
        demo: boolean;
    };
    ssh: {
        host: string;
        username: string;
        password: string;
    };
    telegram: {
        botToken: string;
        chatId: string;
    };
    strategy: {
        rsiPeriod: number;
        candlesLookback: number;
        minTimeframesForEntry: number;
        positionSizePct: number;
        stopLossPct: number;
        takeProfitPct: number;
        topPairsCount: number;
        timeframes: readonly ["15", "60", "240"];
    };
    logging: {
        level: "debug" | "info" | "warn" | "error";
    };
};
export type Timeframe = typeof config.strategy.timeframes[number];
//# sourceMappingURL=config.d.ts.map