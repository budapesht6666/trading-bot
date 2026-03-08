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
        rsiOversold: number;
        rsiOverbought: number;
        candlesLookback: number;
        minTimeframesForEntry: number;
        positionSizePct: number;
        stopLossPct: number;
        takeProfitPct: number;
        topPairsCount: number;
        timeframes: readonly ["15", "60", "240"];
        emaPeriod: number;
        focusPairs: string[];
        focusPairsEnabled: boolean;
        otherPairsEnabled: boolean;
        trendFilterEnabled: boolean;
        minBtcForLong: number;
        minEthForLong: number;
        maxConcurrentPositions: number;
        maxTradesPerDay: number;
        maxDailyDrawdownPct: number;
        atrPeriod: number;
        atrMultiplierSL: number;
        atrMultiplierTP: number;
        trailingActivationPct: number;
        trailingStepPct: number;
        martingaleEnabled: boolean;
        martingaleMultiplier: number;
        martingaleMaxLayers: number;
        martingaleStepPct: number;
    };
    logging: {
        level: "debug" | "info" | "warn" | "error";
    };
};
export type Timeframe = typeof config.strategy.timeframes[number];
export type StrategyConfig = typeof config.strategy;
export type FocusPair = typeof config.strategy.focusPairs[number];
//# sourceMappingURL=config.d.ts.map