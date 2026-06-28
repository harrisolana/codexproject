import { fetchCandles as fetchBinanceCandles, normalizeMarketContext as normalizeBinanceMarketContext } from "./data-source-binance.js";

const dataSources = {
  binance: {
    id: "binance",
    mode: "rest_polling",
    fetchCandles: fetchBinanceCandles,
    normalizeMarketContext: normalizeBinanceMarketContext,
  },
};

export function getDataSource(sourceId = "binance") {
  const source = dataSources[sourceId];
  if (!source) throw new Error(`Unsupported data source: ${sourceId}`);
  return source;
}

export async function fetchCandlesFromSource(sourceId, symbol, interval, limit) {
  return getDataSource(sourceId).fetchCandles(symbol, interval, limit);
}

export function normalizeContextFromSource(sourceId, payload) {
  return getDataSource(sourceId).normalizeMarketContext(payload);
}
