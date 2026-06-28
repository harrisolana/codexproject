import assert from "node:assert/strict";
import { calculateMa, calculateRsi, calculateVolumeRatio } from "../shared/indicators.js";
import { conditionResult } from "../shared/condition-engine.js";
import { summarizeDecision } from "../shared/decision-engine.js";
import { createAlertFromResult, shouldCreateAlert, updateActiveSignals } from "../shared/alerts.js";
import { runBacktest } from "../shared/backtest.js";

function candle(close, volume = 100) {
  return {
    openTime: 0,
    open: close,
    high: close,
    low: close,
    close,
    volume,
    closeTime: 0,
    quoteVolume: volume * close,
  };
}

function marketContext(candles) {
  const first = candles[0];
  const last = candles[candles.length - 1];
  return {
    candles,
    latest: {
      price: last.close,
      changePct: ((last.close - first.open) / first.open) * 100,
    },
  };
}

function metCondition(id, required = true) {
  return { id, type: "price_above", required, status: "met", progress: 1, targetValue: 1 };
}

function unmetCondition(id, required = true) {
  return { id, type: "price_above", required, status: "unmet", progress: 0.5, targetValue: 1 };
}

const maCandles = [1, 2, 3, 4, 5].map((value) => candle(value));
assert.equal(calculateMa(maCandles, 3), 4, "MA should average the last N closes");

const rsiUp = Array.from({ length: 15 }, (_, index) => candle(index + 1));
assert.equal(calculateRsi(rsiUp, 14), 100, "RSI should be 100 when there are no losses");

const volumeCandles = [
  ...Array.from({ length: 20 }, () => candle(1, 100)),
  candle(1, 250),
];
assert.equal(calculateVolumeRatio(volumeCandles, 20), 2.5, "Volume ratio should compare current volume with lookback average");

const allDecision = { id: "all", symbol: "BTCUSDT", triggerMode: "all", cooldownMinutes: 30 };
const allSummary = summarizeDecision(allDecision, [metCondition("a"), metCondition("b")]);
assert.equal(allSummary.shouldAlert, true, "all mode should trigger when all conditions are met");

const requiredOptionalDecision = {
  id: "required-plus-optional",
  symbol: "BTCUSDT",
  triggerMode: "required_plus_optional",
  minOptionalMet: 1,
  cooldownMinutes: 30,
};
const requiredOptionalSummary = summarizeDecision(requiredOptionalDecision, [
  metCondition("required", true),
  unmetCondition("optional-a", false),
  metCondition("optional-b", false),
]);
assert.equal(requiredOptionalSummary.shouldAlert, true, "required_plus_optional should trigger when required and enough optional conditions are met");

const insufficient = conditionResult(
  {
    id: "rsi",
    name: "RSI",
    type: "rsi_below",
    required: true,
    params: { period: 14, value: 40 },
  },
  marketContext([candle(1), candle(2)]),
);
assert.equal(insufficient.status, "insufficient_data", "Indicator conditions should report insufficient_data when candles are not enough");

const alertResult = {
  decision: { id: "d1", name: "BTC test", symbol: "BTCUSDT", cooldownMinutes: 30, conditions: [{ timeframe: "15m" }] },
  shouldAlert: true,
  reason: "ready",
  conditionResults: [metCondition("c1"), metCondition("c2")],
};
const alert = createAlertFromResult(alertResult, 1000);
assert.ok(alert.signalKey.includes("d1::BTCUSDT::15m"), "Alert signalKey should include decision, symbol and timeframe");
assert.equal(shouldCreateAlert(alertResult, {}, {}, 1000).ok, true, "Fresh signal should create alert");
assert.equal(shouldCreateAlert(alertResult, { [alert.signalKey]: 1000 }, {}, 1000 + 60_000).ok, false, "Signal should be cooled down");
const activeSignals = updateActiveSignals([alertResult], {});
assert.equal(shouldCreateAlert(alertResult, {}, activeSignals, 1000 + 31 * 60_000).ok, false, "Active signal should not repeat while still met");
assert.equal(shouldCreateAlert(alertResult, {}, {}, 1000 + 31 * 60_000).ok, true, "Signal can alert again after it has reset");

const oneHourSignal = {
  ...alertResult,
  decision: { ...alertResult.decision, conditions: [{ timeframe: "1h" }] },
};
assert.notEqual(
  createAlertFromResult(oneHourSignal, 1000).signalKey,
  alert.signalKey,
  "Different timeframes should produce different signal keys",
);

const changedTargetSignal = {
  ...alertResult,
  conditionResults: [metCondition("c1"), { ...metCondition("c2"), targetValue: 2 }],
};
assert.notEqual(
  createAlertFromResult(changedTargetSignal, 1000).signalKey,
  alert.signalKey,
  "Changed target parameters should produce a new signal key",
);

const resetSignals = updateActiveSignals([], activeSignals);
assert.equal(
  shouldCreateAlert(alertResult, {}, resetSignals, 1000 + 31 * 60_000).ok,
  true,
  "A signal can alert after conditions first become unmet and then become met again",
);

const backtestDecision = {
  id: "bt1",
  symbol: "BTCUSDT",
  triggerMode: "all",
  conditions: [
    {
      id: "price-above-10",
      name: "Price above 10",
      type: "price_above",
      required: true,
      params: { value: 10 },
    },
  ],
};
const backtestCandles = [8, 9, 10, 11, 12, 9, 11].map((value, index) => ({
  ...candle(value),
  openTime: index,
}));
const backtest = runBacktest(backtestDecision, backtestCandles, { warmup: 1 });
assert.equal(backtest.triggerCount, 2, "Backtest should count new trigger waves, not every candle while conditions remain met");
assert.equal(backtest.winRate, null, "Backtest win rate is a placeholder until review/outcome rules are added");

console.log("All tests passed");
