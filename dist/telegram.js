"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSignalNotification = sendSignalNotification;
exports.sendErrorNotification = sendErrorNotification;
exports.sendStartNotification = sendStartNotification;
exports.sendSummaryNotification = sendSummaryNotification;
const node_ssh_1 = require("node-ssh");
const config_1 = require("./config");
const logger_1 = require("./logger");
const positions_1 = require("./positions");
const SEPARATOR = '\n' + '═'.repeat(30) + '\n';
/**
 * Send a message via Telegram Bot API through SSH (due to geo restrictions)
 */
async function sendViaSsh(text) {
    const ssh = new node_ssh_1.NodeSSH();
    try {
        await ssh.connect({
            host: config_1.config.ssh.host,
            username: config_1.config.ssh.username,
            password: config_1.config.ssh.password,
            readyTimeout: 15000,
        });
        const escaped = text.replace(/'/g, "'\\''");
        const url = `https://api.telegram.org/bot${config_1.config.telegram.botToken}/sendMessage`;
        const cmd = `curl -s -X POST "${url}" -H "Content-Type: application/json" -d '{"chat_id":"${config_1.config.telegram.chatId}","text":"${escaped}","parse_mode":"HTML"}'`;
        const result = await ssh.execCommand(cmd);
        if (result.stderr) {
            logger_1.logger.warn(`Telegram SSH stderr: ${result.stderr}`);
        }
        const resp = JSON.parse(result.stdout || '{}');
        if (!resp.ok) {
            throw new Error(`Telegram error: ${JSON.stringify(resp)}`);
        }
        logger_1.logger.info('Telegram notification sent successfully');
    }
    finally {
        ssh.dispose();
    }
}
/**
 * Try to send Telegram message directly first, fallback to SSH
 */
async function sendMessage(text) {
    // Always use SSH since direct access to Telegram may be geo-restricted
    try {
        await sendViaSsh(text);
    }
    catch (err) {
        logger_1.logger.error('Failed to send Telegram message', err);
        throw err;
    }
}
async function sendSignalNotification(signal) {
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
        SEPARATOR,
    ].join('\n');
    await sendMessage(text);
}
async function sendErrorNotification(message) {
    const text = `⚠️ <b>Ошибка бота</b>\n${message}`;
    try {
        await sendMessage(text);
    }
    catch (err) {
        logger_1.logger.error('Could not send error notification', err);
    }
}
async function sendStartNotification() {
    const text = `🤖 <b>RSI Divergence Bot запущен</b>\n⏰ ${new Date().toISOString()}\n📊 Анализ топ-30 пар на 15m/1h/4h`;
    try {
        await sendMessage(text);
    }
    catch (err) {
        logger_1.logger.error('Could not send start notification', err);
    }
}
async function sendSummaryNotification(analyzed, signals) {
    const positions = (0, positions_1.getOpenPositions)();
    const lines = [
        `📋 <b>Открытые позиции</b> (${positions.length})`,
        `⏰ ${new Date().toISOString()}`,
    ];
    if (positions.length === 0) {
        lines.push('Нет открытых позиций');
    }
    else {
        for (const pos of positions) {
            const emoji = pos.direction === 'long' ? '🟢' : '🔴';
            const coin = pos.symbol.replace('USDT', '');
            const pnl = pos.direction === 'long' ? '+4%' : '-4%';
            lines.push(`${emoji} ${pos.symbol} | ${pos.qty.toFixed(2)} ${coin} | TP: ${pnl}`);
        }
    }
    const text = lines.join('\n');
    try {
        await sendMessage(text);
    }
    catch (err) {
        logger_1.logger.error('Could not send summary notification', err);
    }
}
//# sourceMappingURL=telegram.js.map