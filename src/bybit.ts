import { NodeSSH } from 'node-ssh';
import * as crypto from 'crypto';
import { config } from './config';
import { logger } from './logger';

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

function signRequest(params: Record<string, string | number>, timestamp: number): string {
  const recvWindow = 5000;
  const queryString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const signStr = `${timestamp}${config.bybit.apiKey}${recvWindow}${queryString}`;
  return crypto.createHmac('sha256', config.bybit.apiSecret).update(signStr).digest('hex');
}

async function bybitRequest(
  method: 'GET' | 'POST',
  endpoint: string,
  params: Record<string, string | number> = {},
  needsAuth = false
): Promise<unknown> {
  const ssh = new NodeSSH();

  try {
    await ssh.connect({
      host: config.ssh.host,
      username: config.ssh.username,
      password: config.ssh.password,
      readyTimeout: 15000,
    });

    let curlCmd: string;

    if (method === 'GET') {
      const queryString = Object.keys(params)
        .map((k) => `${k}=${encodeURIComponent(String(params[k]))}`)
        .join('&');
      const url = `${config.bybit.baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;

      if (needsAuth) {
        const timestamp = Date.now();
        const recvWindow = 5000;
        const paramsCopy = { ...params };
        const sign = signRequest(paramsCopy, timestamp);
        const headers = [
          `-H "X-BAPI-API-KEY: ${config.bybit.apiKey}"`,
          `-H "X-BAPI-TIMESTAMP: ${timestamp}"`,
          `-H "X-BAPI-RECV-WINDOW: ${recvWindow}"`,
          `-H "X-BAPI-SIGN: ${sign}"`,
        ].join(' ');
        curlCmd = `curl -s -X GET ${headers} "${url}"`;
      } else {
        curlCmd = `curl -s -X GET "${url}"`;
      }
    } else {
      // POST
      const timestamp = Date.now();
      const recvWindow = 5000;
      const body = JSON.stringify(params);
      const signStr = `${timestamp}${config.bybit.apiKey}${recvWindow}${body}`;
      const sign = crypto.createHmac('sha256', config.bybit.apiSecret).update(signStr).digest('hex');
      const headers = [
        `-H "Content-Type: application/json"`,
        `-H "X-BAPI-API-KEY: ${config.bybit.apiKey}"`,
        `-H "X-BAPI-TIMESTAMP: ${timestamp}"`,
        `-H "X-BAPI-RECV-WINDOW: ${recvWindow}"`,
        `-H "X-BAPI-SIGN: ${sign}"`,
      ].join(' ');
      curlCmd = `curl -s -X POST ${headers} -d '${body.replace(/'/g, "'\\''")}' "${config.bybit.baseUrl}${endpoint}"`;
    }

    logger.debug(`SSH curl: ${curlCmd.substring(0, 120)}...`);
    const result = await ssh.execCommand(curlCmd);

    if (result.stderr && result.stderr.length > 0) {
      logger.warn(`SSH stderr: ${result.stderr}`);
    }

    if (!result.stdout) {
      throw new Error('Empty response from SSH');
    }

    const data = JSON.parse(result.stdout);
    if (data.retCode !== undefined && data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retCode} - ${data.retMsg}`);
    }

    return data;
  } finally {
    ssh.dispose();
  }
}

export async function getTopPairs(count: number): Promise<TickerInfo[]> {
  logger.info(`Fetching top ${count} pairs by 24h volume...`);

  const data = await bybitRequest('GET', '/v5/market/tickers', {
    category: 'linear',
  }) as { result: { list: Array<{ symbol: string; turnover24h: string; lastPrice: string }> } };

  const tickers = data.result.list
    .filter((t) => t.symbol.endsWith('USDT'))
    .map((t) => ({
      symbol: t.symbol,
      volume24h: parseFloat(t.turnover24h),
      lastPrice: parseFloat(t.lastPrice),
    }))
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, count);

  logger.info(`Got ${tickers.length} top pairs`);
  return tickers;
}

export async function getCandles(
  symbol: string,
  interval: string,
  limit = 100
): Promise<Candle[]> {
  const data = await bybitRequest('GET', '/v5/market/kline', {
    category: 'linear',
    symbol,
    interval,
    limit,
  }) as { result: { list: string[][] } };

  // Bybit returns newest first, so reverse
  const candles: Candle[] = data.result.list.reverse().map((c) => ({
    openTime: parseInt(c[0]),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));

  return candles;
}

export async function getWalletBalance(): Promise<WalletBalance> {
  logger.info('Fetching wallet balance...');

  const data = await bybitRequest(
    'GET',
    '/v5/account/wallet-balance',
    { accountType: 'UNIFIED' },
    true
  ) as {
    result: {
      list: Array<{
        totalEquity: string;
        coin: Array<{ coin: string; availableToWithdraw: string }>;
      }>;
    };
  };

  const account = data.result.list[0];
  const usdtCoin = account.coin.find((c) => c.coin === 'USDT') || account.coin[0];

  return {
    totalEquity: parseFloat(account.totalEquity),
    availableBalance: parseFloat(usdtCoin?.availableToWithdraw || '0'),
    coin: 'USDT',
  };
}

export async function getSymbolInfo(symbol: string): Promise<{ lotSizeFilter: { minOrderQty: string; qtyStep: string } }> {
  const data = await bybitRequest('GET', '/v5/market/instruments-info', {
    category: 'linear',
    symbol,
  }) as { result: { list: Array<{ lotSizeFilter: { minOrderQty: string; qtyStep: string } }> } };

  return data.result.list[0];
}

export async function placeOrder(
  symbol: string,
  side: 'Buy' | 'Sell',
  qty: number,
  price: number,
  stopLoss: number,
  takeProfit: number
): Promise<OrderResult> {
  logger.info(`Placing ${side} order: ${symbol} qty=${qty} price=${price}`);

  // Round qty to appropriate decimal places
  const symbolInfo = await getSymbolInfo(symbol);
  const qtyStep = parseFloat(symbolInfo.lotSizeFilter.qtyStep);
  const decimals = qtyStep < 1 ? Math.ceil(-Math.log10(qtyStep)) : 0;
  const roundedQty = parseFloat(qty.toFixed(decimals));

  const data = await bybitRequest(
    'POST',
    '/v5/order/create',
    {
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
    },
    true
  ) as { result: { orderId: string } };

  return {
    orderId: data.result.orderId,
    symbol,
    side,
    qty: roundedQty,
    price,
  };
}
