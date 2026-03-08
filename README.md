# RSI Divergence Trading Bot — Bybit Demo

Торговый бот на TypeScript/Node.js для Bybit Demo аккаунта.

## Стратегия

- **Сигнал:** RSI дивергенция (бычья / медвежья)
- **Таймфреймы:** 15m, 1h, 4h
- **Минимум подтверждений:** 2 из 3 таймфреймов
- **Пары:** Топ-30 USDT Perpetual по объёму за 24ч
- **Размер позиции:** 5% от баланса
- **Stop Loss:** 2% | **Take Profit:** 4%

## Запуск

```bash
# Разовый прогон (для cron)
npm run build && node dist/index.js --once

# Непрерывный режим (каждые 15 мин)
npm start

# Dev режим (без сборки)
npm run dev -- --once
```

## Бэктестинг

```bash
# Собрать проект
npm run build

# Бэктест одной пары (по умолчанию 90 дней, 1h)
npm run backtest:single

# С указанием параметров
node dist/backtest-runner.js --symbol ETHUSDT --days 60 --timeframe 60

# Полный бэктест на нескольких парах
npm run backtest:full
```

### Параметры backtest-runner

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `--symbol` | Торговая пара (напр. BTCUSDT) | - |
| `--days` | Количество дней для анализа | 90 |
| `--timeframe` | Таймфрейм (15, 60, 240) | 60 |
| `--full` | Запустить на всех парах | false |

Результаты сохраняются в `backtest-results.json`.

## Cron (рекомендуется)

```cron
*/15 * * * * cd /home/dorozhkin/trading-bot && node dist/index.js --once >> /var/log/trading-bot.log 2>&1
```

## Структура

```
src/
  config.ts      — Конфиг (ключи API, параметры стратегии)
  bybit.ts       — Клиент Bybit через SSH (нода-ssh)
  indicators.ts  — RSI + поиск дивергенций
  strategy.ts    — Логика стратегии
  telegram.ts    — Telegram уведомления
  logger.ts      — Логгер
  index.ts       — Точка входа
```

## Примечания

- Все запросы к Bybit API идут через SSH на Amnezia-сервер (170.168.112.26)
- Telegram уведомления тоже через SSH (для обхода гео-блокировок)
- Bybit Demo: https://api-demo.bybit.com
