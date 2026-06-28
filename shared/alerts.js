export function buildSignalKey(result) {
  const metConditions = result.conditionResults
    .filter((condition) => condition.status === "met")
    .map((condition) => `${condition.id}:${condition.type}:${condition.targetValue}`)
    .sort();
  const timeframes = result.decision.conditions
    .map((condition) => condition.timeframe)
    .filter(Boolean)
    .sort();

  return [
    result.decision.id,
    result.decision.symbol,
    timeframes.join("+"),
    metConditions.join("|"),
  ].join("::");
}

export function createAlertFromResult(result, now = Date.now()) {
  const signalKey = buildSignalKey(result);
  return {
    id: `${result.decision.id}-${now}`,
    signalKey,
    decisionId: result.decision.id,
    name: result.decision.name,
    symbol: result.decision.symbol,
    createdAt: now,
    triggerPrice: result.conditionResults.find((item) => item.type.includes("price"))?.currentValue ?? null,
    summary: result.reason,
    conditions: result.conditionResults,
    review: {
      action: "watch",
      entryPrice: "",
      stopLoss: "",
      takeProfit: "",
      result: "unreviewed",
      note: "",
      updatedAt: null,
    },
  };
}

export function shouldCreateAlert(result, notified = {}, activeSignals = {}, now = Date.now()) {
  if (!result.shouldAlert) return { ok: false, signalKey: "" };
  const signalKey = buildSignalKey(result);
  const cooldownMs = (result.decision.cooldownMinutes || 30) * 60 * 1000;
  const lastAlertTime = notified[signalKey] || 0;
  if (lastAlertTime && now - lastAlertTime < cooldownMs) return { ok: false, signalKey };
  if (activeSignals[signalKey]) return { ok: false, signalKey };
  return { ok: true, signalKey };
}

export function updateActiveSignals(results, previous = {}) {
  const next = {};
  for (const result of results) {
    if (!result.shouldAlert) continue;
    next[buildSignalKey(result)] = true;
  }
  return next;
}

export function upsertAlertReview(alerts, alertId, reviewPatch) {
  return alerts.map((alert) =>
    alert.id === alertId
      ? {
          ...alert,
          review: {
            action: "watch",
            entryPrice: "",
            stopLoss: "",
            takeProfit: "",
            result: "unreviewed",
            note: "",
            ...(alert.review || {}),
            ...reviewPatch,
            updatedAt: Date.now(),
          },
        }
      : alert,
  );
}
