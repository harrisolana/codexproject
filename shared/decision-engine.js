import { buildConditionResult, conditionResult } from "./condition-engine.js";

export function summarizeDecision(decision, conditionResults) {
  const required = conditionResults.filter((item) => item.required);
  const optional = conditionResults.filter((item) => !item.required);
  const metRequired = required.filter((item) => item.status === "met").length;
  const metOptional = optional.filter((item) => item.status === "met").length;
  const metCount = conditionResults.filter((item) => item.status === "met").length;
  const nearCount = conditionResults.filter((item) => item.status === "near").length;
  const totalCount = conditionResults.length;
  const requiredDone = metRequired === required.length;
  const optionalDone =
    decision.triggerMode === "required_plus_optional"
      ? metOptional >= (decision.minOptionalMet || 0)
      : metCount === totalCount;
  const shouldAlert = decision.triggerMode === "all" ? metCount === totalCount : requiredDone && optionalDone;
  const progress = totalCount ? conditionResults.reduce((sum, item) => sum + item.progress, 0) / totalCount : 0;
  const status = shouldAlert ? "ready" : nearCount || progress >= 0.72 ? "near" : "waiting";
  const reason = shouldAlert
    ? "触发条件已满足，建议打开详情人工确认"
    : `${metCount}/${totalCount} 条件已满足，${nearCount} 条接近满足`;

  return { status, progress, metCount, totalCount, shouldAlert, reason };
}

export async function evaluateDecision(decision, getMarketContext, formatters = {}) {
  if (!decision.enabled) {
    return {
      decision,
      status: "disabled",
      progress: 0,
      metCount: 0,
      totalCount: decision.conditions.length,
      conditionResults: [],
      shouldAlert: false,
      reason: "决策已停用",
      updatedAt: Date.now(),
    };
  }

  const conditionResults = [];

  for (const condition of decision.conditions) {
    try {
      const context = await getMarketContext(decision.symbol, condition.timeframe);
      conditionResults.push(conditionResult(condition, context, formatters));
    } catch (error) {
      conditionResults.push(
        buildConditionResult(condition, "source_error", Number.NaN, null, 0, `数据源异常：${error.message}`),
      );
    }
  }

  return {
    decision,
    conditionResults,
    ...summarizeDecision(decision, conditionResults),
    updatedAt: Date.now(),
  };
}
