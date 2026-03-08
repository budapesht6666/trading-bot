"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    bybit: {
        apiKey: 'OOO0sf2FmHqtYcdn3Z',
        apiSecret: 'AggMjm9kYCXa3L1Bf9dhK3fYnxvj0NrgqRW1',
        baseUrl: 'https://api-demo.bybit.com',
        demo: true,
    },
    ssh: {
        host: '170.168.112.26',
        username: 'root',
        password: 'DQXZ9RkGGZ6dGoWa',
    },
    telegram: {
        botToken: '8626201827:AAEKhzCSnccqUZOryn3FN9rme02UINwHCDc',
        chatId: '7517318171',
    },
    strategy: {
        rsiPeriod: 21, // оптимально для альтов (вместо 14)
        rsiOversold: 25, // уровень перепроданности (вместо 30)
        rsiOverbought: 75, // уровень перекупленности (вместо 70)
        candlesLookback: 100,
        minTimeframesForEntry: 2,
        positionSizePct: 5, // % of USDT balance
        stopLossPct: 2, // % from entry price
        takeProfitPct: 6, // % from entry price (вместо 4)
        topPairsCount: 30,
        timeframes: ['15', '60', '240'], // 15m, 1h, 4h in Bybit format
        emaPeriod: 50, // EMA period for trend filter
        // Focus pairs - приоритетные пары для торговли
        focusPairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'],
        focusPairsEnabled: true, // Включить режим фокус-пар
        otherPairsEnabled: false, // Анализировать только фокус-пары
        // Trend filter - фильтр тренда
        trendFilterEnabled: true, // Включить фильтр тренда
        minBtcForLong: 50000, // BTC > $50000 → только лонги
        minEthForLong: 2000, // ETH > $2000 → только лонги
        // Multi-pair settings
        maxConcurrentPositions: 3, // Max open positions at once
        maxTradesPerDay: 10, // Max trades per day
        maxDailyDrawdownPct: 5, // Stop trading if drawdown > 5%
        // ATR-based SL/TP settings
        atrPeriod: 14, // ATR period for dynamic SL/TP
        atrMultiplierSL: 2, // ATR multiplier for Stop Loss
        atrMultiplierTP: 3, // ATR multiplier for Take Profit
        // Trailing stop settings
        trailingActivationPct: 3, // Activate trailing stop when profit reaches +3%
        trailingStepPct: 1, // Move SL on every +1% profit increase
        // Martingale/Averaging settings
        martingaleEnabled: true,
        martingaleMultiplier: 2, // Multiply position size by this factor on each layer
        martingaleMaxLayers: 2, // Max number of averaging layers
        martingaleStepPct: 2, // Price drop % to trigger next layer
    },
    logging: {
        level: 'info',
    },
};
//# sourceMappingURL=config.js.map