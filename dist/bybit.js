"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTopPairs = getTopPairs;
exports.getCandles = getCandles;
exports.getWalletBalance = getWalletBalance;
exports.getSymbolInfo = getSymbolInfo;
exports.placeOrder = placeOrder;
const node_ssh_1 = require("node-ssh");
const crypto = __importStar(require("crypto"));
const config_1 = require("./config");
const logger_1 = require("./logger");
function signRequest(params, timestamp) {
    const recvWindow = 5000;
    const queryString = Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&');
    const signStr = `${timestamp}${config_1.config.bybit.apiKey}${recvWindow}${queryString}`;
    return crypto.createHmac('sha256', config_1.config.bybit.apiSecret).update(signStr).digest('hex');
}
async function bybitRequest(method, endpoint, params = {}, needsAuth = false) {
    const ssh = new node_ssh_1.NodeSSH();
    try {
        await ssh.connect({
            host: config_1.config.ssh.host,
            username: config_1.config.ssh.username,
            password: config_1.config.ssh.password,
            readyTimeout: 15000,
        });
        let curlCmd;
        if (method === 'GET') {
            const queryString = Object.keys(params)
                .map((k) => `${k}=${encodeURIComponent(String(params[k]))}`)
                .join('&');
            const url = `${config_1.config.bybit.baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;
            if (needsAuth) {
                const timestamp = Date.now();
                const recvWindow = 5000;
                const paramsCopy = { ...params };
                const sign = signRequest(paramsCopy, timestamp);
                const headers = [
                    `-H "X-BAPI-API-KEY: ${config_1.config.bybit.apiKey}"`,
                    `-H "X-BAPI-TIMESTAMP: ${timestamp}"`,
                    `-H "X-BAPI-RECV-WINDOW: ${recvWindow}"`,
                    `-H "X-BAPI-SIGN: ${sign}"`,
                ].join(' ');
                curlCmd = `curl -s -X GET ${headers} "${url}"`;
            }
            else {
                curlCmd = `curl -s -X GET "${url}"`;
            }
        }
        else {
            // POST
            const timestamp = Date.now();
            const recvWindow = 5000;
            const body = JSON.stringify(params);
            const signStr = `${timestamp}${config_1.config.bybit.apiKey}${recvWindow}${body}`;
            const sign = crypto.createHmac('sha256', config_1.config.bybit.apiSecret).update(signStr).digest('hex');
            const headers = [
                `-H "Content-Type: application/json"`,
                `-H "X-BAPI-API-KEY: ${config_1.config.bybit.apiKey}"`,
                `-H "X-BAPI-TIMESTAMP: ${timestamp}"`,
                `-H "X-BAPI-RECV-WINDOW: ${recvWindow}"`,
                `-H "X-BAPI-SIGN: ${sign}"`,
            ].join(' ');
            curlCmd = `curl -s -X POST ${headers} -d '${body.replace(/'/g, "'\\''")}' "${config_1.config.bybit.baseUrl}${endpoint}"`;
        }
        logger_1.logger.debug(`SSH curl: ${curlCmd.substring(0, 120)}...`);
        const result = await ssh.execCommand(curlCmd);
        if (result.stderr && result.stderr.length > 0) {
            logger_1.logger.warn(`SSH stderr: ${result.stderr}`);
        }
        if (!result.stdout) {
            throw new Error('Empty response from SSH');
        }
        const data = JSON.parse(result.stdout);
        if (data.retCode !== undefined && data.retCode !== 0) {
            throw new Error(`Bybit API error: ${data.retCode} - ${data.retMsg}`);
        }
        return data;
    }
    finally {
        ssh.dispose();
    }
}
async function getTopPairs(count) {
    logger_1.logger.info(`Fetching top ${count} pairs by 24h volume...`);
    const data = await bybitRequest('GET', '/v5/market/tickers', {
        category: 'linear',
    });
    const tickers = data.result.list
        .filter((t) => t.symbol.endsWith('USDT'))
        .map((t) => ({
        symbol: t.symbol,
        volume24h: parseFloat(t.turnover24h),
        lastPrice: parseFloat(t.lastPrice),
    }))
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, count);
    logger_1.logger.info(`Got ${tickers.length} top pairs`);
    return tickers;
}
async function getCandles(symbol, interval, limit = 100) {
    const data = await bybitRequest('GET', '/v5/market/kline', {
        category: 'linear',
        symbol,
        interval,
        limit,
    });
    // Bybit returns newest first, so reverse
    const candles = data.result.list.reverse().map((c) => ({
        openTime: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
    }));
    return candles;
}
async function getWalletBalance() {
    logger_1.logger.info('Fetching wallet balance...');
    const data = await bybitRequest('GET', '/v5/account/wallet-balance', { accountType: 'UNIFIED' }, true);
    const account = data.result.list[0];
    const usdtCoin = account.coin.find((c) => c.coin === 'USDT') || account.coin[0];
    return {
        totalEquity: parseFloat(account.totalEquity),
        availableBalance: parseFloat(usdtCoin?.availableToWithdraw || '0'),
        coin: 'USDT',
    };
}
async function getSymbolInfo(symbol) {
    const data = await bybitRequest('GET', '/v5/market/instruments-info', {
        category: 'linear',
        symbol,
    });
    return data.result.list[0];
}
async function placeOrder(symbol, side, qty, price, stopLoss, takeProfit) {
    logger_1.logger.info(`Placing ${side} order: ${symbol} qty=${qty} price=${price}`);
    // Round qty to appropriate decimal places
    const symbolInfo = await getSymbolInfo(symbol);
    const qtyStep = parseFloat(symbolInfo.lotSizeFilter.qtyStep);
    const decimals = qtyStep < 1 ? Math.ceil(-Math.log10(qtyStep)) : 0;
    const roundedQty = parseFloat(qty.toFixed(decimals));
    const data = await bybitRequest('POST', '/v5/order/create', {
        category: 'linear',
        symbol,
        side,
        orderType: 'Market',
        qty: String(roundedQty),
        stopLoss: String(stopLoss.toFixed(4)),
        takeProfit: String(takeProfit.toFixed(4)),
        timeInForce: 'IOC',
        reduceOnly: 'false',
        closeOnTrigger: 'false',
    }, true);
    return {
        orderId: data.result.orderId,
        symbol,
        side,
        qty: roundedQty,
        price,
    };
}
//# sourceMappingURL=bybit.js.map