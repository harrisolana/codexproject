import { conditionResult } from "./condition-engine.js";
import { summarizeDecision } from "./decision-engine.js";

function contextForWindow(candles) {
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

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function runBacktest(decision, candles, options = {}) {
  const warmup = Math.max(1, Number(options.warmup || 60));
  const results = [];
  let previousSignal = false;

  for (let index = warmup - 1; index < candles.length; index += 1) {
    const windowCandles = candles.slice(0, index + 1);
    const conditionResults = decision.conditions.map((condition) =>
      conditionResult(condition, contextForWindow(windowCandles), options.formatters || {}),
    );
    const summary = summarizeDecision(decision, conditionResults);
    const isNewTrigger = summary.shouldAlert && !previousSignal;

    if (isNewTrigger) {
      results.push({
        index,
        time: candles[index].openTime,
        price: candles[index].close,
        summary,
      });
    }

    previousSignal = summary.shouldAlert;
  }

  const intervals = results.slice(1).map((result, index) => result.index - results[index].index);

  return {
    decisionId: decision.id,
    symbol: decision.symbol,
    candleCount: candles.length,
    triggerCount: results.length,
    winRate: null,
    maxConsecutiveFalseSignals: 0,
    averageTriggerInterval: average(intervals),
    triggers: results,
  };
}
