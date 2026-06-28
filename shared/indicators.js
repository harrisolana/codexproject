export function average(values) {
  if (!values.length) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateMa(candles, period) {
  if (!Array.isArray(candles) || candles.length < period) return Number.NaN;
  return average(candles.slice(-period).map((item) => item.close));
}

export function calculateRsi(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length <= period) return Number.NaN;
  const closes = candles.map((item) => item.close);
  const slice = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;

  for (let index = 1; index < slice.length; index += 1) {
    const diff = slice[index] - slice[index - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateVolumeRatio(candles, lookback = 20) {
  if (!Array.isArray(candles) || candles.length <= lookback) return Number.NaN;
  const current = candles[candles.length - 1].volume;
  const baseline = average(candles.slice(-(lookback + 1), -1).map((item) => item.volume));
  return baseline ? current / baseline : Number.NaN;
}
