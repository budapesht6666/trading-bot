export const config = {
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
    rsiPeriod: 21,               // оптимально для альтов (вместо 14)
    rsiOversold: 25,             // уровень перепроданности (вместо 30)
    rsiOverbought: 75,           // уровень перекупленности (вместо 70)
    candlesLookback: 100,
    minTimeframesForEntry: 2,
    positionSizePct: 5,          // % of USDT balance
    stopLossPct: 2,              // % from entry price
    takeProfitPct: 6,            // % from entry price (вместо 4)
    topPairsCount: 30,
    timeframes: ['15', '60', '240'] as const, // 15m, 1h, 4h in Bybit format
    emaPeriod: 50,               // EMA period for trend filter
    
    // Focus pairs - приоритетные пары для торговли
    focusPairs: ['XRPUSDT', 'SOLUSDT', 'ETHUSDT'],
    
    // Multi-pair settings
    maxConcurrentPositions: 3,  // Max open positions at once
    maxTradesPerDay: 10,        // Max trades per day
    maxDailyDrawdownPct: 5,     // Stop trading if drawdown > 5%
  },

  logging: {
    level: 'info' as 'debug' | 'info' | 'warn' | 'error',
  },
};

export type Timeframe = typeof config.strategy.timeframes[number];

export type StrategyConfig = typeof config.strategy;

export type FocusPair = typeof config.strategy.focusPairs[number];
