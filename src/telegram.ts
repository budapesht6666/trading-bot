import { NodeSSH } from 'node-ssh';
import { config } from './config';
import { logger } from './logger';
import { TradeSignal } from './strategy';

/**
 * Send a message via Telegram Bot API through SSH (due to geo restrictions)
 */
async function sendViaSsh(text: string): Promise<void> {
  const ssh = new NodeSSH();

  try {
    await ssh.connect({
      host: config.ssh.host,
      username: config.ssh.username,
      password: config.ssh.password,
      readyTimeout: 15000,
    });

    const escaped = text.replace(/'/g, "'\\''");
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    const cmd = `curl -s -X POST "${url}" -H "Content-Type: application/json" -d '{"chat_id":"${config.telegram.chatId}","text":"${escaped}","parse_mode":"HTML"}'`;

    const result = await ssh.execCommand(cmd);
    if (result.stderr) {
      logger.warn(`Telegram SSH stderr: ${result.stderr}`);
    }

    const resp = JSON.parse(result.stdout || '{}');
    if (!resp.ok) {
      throw new Error(`Telegram error: ${JSON.stringify(resp)}`);
    }

    logger.info('Telegram notification sent successfully');
  } finally {
    ssh.dispose();
  }
}

/**
 * Try to send Telegram message directly first, fallback to SSH
 */
async function sendMessage(text: string): Promise<void> {
  // Always use SSH since direct access to Telegram may be geo-restricted
  try {
    await sendViaSsh(text);
  } catch (err) {
    logger.error('Failed to send Telegram message', err);
    throw err;
  }
}

export async function sendSignalNotification(signal: TradeSignal): Promise<void> {
  const directionEmoji = signal.direction === 'long' ? '🟢' : '🔴';
  const directionLabel = signal.direction === 'long' ? 'ЛОНГ' : 'ШОРТ';

  const tf15 = signal.confirmedTimeframes.includes('15') ? '✅' : '❌';
  const tf1h = signal.confirmedTimeframes.includes('60') ? '✅' : '❌';
  const tf4h = signal.confirmedTimeframes.includes('240') ? '✅' : '❌';

  const strengthLabel = signal.strength === 'strong' ? '🔥 Сильный (3 TF)' : '⚡ Слабый (2 TF)';

  const sizeUsd = signal.qty * signal.entryPrice;
  const coinName = signal.symbol.replace('USDT', '');

  const tpPct = signal.direction === 'long' ? '+4%' : '-4%';
  const slPct = signal.direction === 'long' ? '-2%' : '+2%';

  const text = [
    `${directionEmoji} <b>${directionLabel} сигнал: ${signal.symbol}</b>`,
    `📊 Подтверждения: 15m ${tf15} | 1h ${tf1h} | 4h ${tf4h}`,
    `💪 Сила: ${strengthLabel}`,
    `💰 Цена входа: $${signal.entryPrice.toFixed(4)}`,
    `🎯 TP: $${signal.takeProfit.toFixed(4)} (${tpPct})`,
    `🛑 SL: $${signal.stopLoss.toFixed(4)} (${slPct})`,
    `📈 Размер: ${signal.qty} ${coinName} (~$${sizeUsd.toFixed(0)})`,
    signal.orderId ? `🔑 Order ID: ${signal.orderId}` : '⏳ Ордер размещается...',
  ].join('\n');

  await sendMessage(text);
}

export async function sendErrorNotification(message: string): Promise<void> {
  const text = `⚠️ <b>Ошибка бота</b>\n${message}`;
  try {
    await sendMessage(text);
  } catch (err) {
    logger.error('Could not send error notification', err);
  }
}

export async function sendStartNotification(): Promise<void> {
  const text = `🤖 <b>RSI Divergence Bot запущен</b>\n⏰ ${new Date().toISOString()}\n📊 Анализ топ-30 пар на 15m/1h/4h`;
  try {
    await sendMessage(text);
  } catch (err) {
    logger.error('Could not send start notification', err);
  }
}

export async function sendSummaryNotification(analyzed: number, signals: number): Promise<void> {
  const text = [
    `📋 <b>Итоги сканирования</b>`,
    `🔍 Проанализировано пар: ${analyzed}`,
    `📡 Сигналов найдено: ${signals}`,
    `⏰ ${new Date().toISOString()}`,
  ].join('\n');

  try {
    await sendMessage(text);
  } catch (err) {
    logger.error('Could not send summary notification', err);
  }
}
