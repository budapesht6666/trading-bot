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
    rsiPeriod: 14,
    candlesLookback: 100,
    minTimeframesForEntry: 2,
    positionSizePct: 5,       // % of USDT balance
    stopLossPct: 2,           // % from entry price
    takeProfitPct: 4,         // % from entry price
    topPairsCount: 30,
    timeframes: ['15', '60', '240'] as const, // 15m, 1h, 4h in Bybit format
  },

  logging: {
    level: 'info' as 'debug' | 'info' | 'warn' | 'error',
  },
};

export type Timeframe = typeof config.strategy.timeframes[number];
