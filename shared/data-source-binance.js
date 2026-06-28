export const BINANCE_API_BASE = "https://api.binance.com";

export function parseCandle(row) {
  return {
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: Number(row[6]),
    quoteVolume: Number(row[7]),
  };
}

export async function fetchCandles(symbol, interval, limit = 120, options = {}) {
  const apiBase = options.apiBase || BINANCE_API_BASE;
  const fetcher = options.fetcher || globalThis.fetch;
  const url = new URL("/api/v3/klines", apiBase);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));

  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Binance 返回 ${response.status}`);
  }

  const rows = await response.json();
  return rows.map(parseCandle);
}

export function normalizeMarketContext({ source = "binance", symbol, timeframe, candles }) {
  const first = candles[0];
  const last = candles[candles.length - 1];
  const high = Math.max(...candles.map((item) => item.high));
  const low = Math.min(...candles.map((item) => item.low));
  const volume = candles.reduce((sum, item) => sum + item.volume, 0);
  const quoteVolume = candles.reduce((sum, item) => sum + item.quoteVolume, 0);
  const change = last.close - first.open;
  const changePct = (change / first.open) * 100;

  return {
    source,
    type: "market.kline",
    symbol,
    timeframe,
    timestamp: last.closeTime,
    candles,
    latest: {
      open: first.open,
      price: last.close,
      high,
      low,
      volume,
      quoteVolume,
      change,
      changePct,
    },
  };
}
