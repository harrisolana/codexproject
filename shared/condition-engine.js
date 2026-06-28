import { calculateMa, calculateRsi, calculateVolumeRatio } from "./indicators.js";

export function progressToward(current, target, direction) {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return 0;
  if (direction === "above") {
    if (current >= target) return 1;
    if (target === 0) return 0;
    return Math.max(0, Math.min(0.98, current / target));
  }
  if (current <= target) return 1;
  if (current === 0) return 0;
  return Math.max(0, Math.min(0.98, target / current));
}

export function statusFromProgress(progress) {
  if (progress >= 1) return "met";
  if (progress >= 0.85) return "near";
  return "unmet";
}

export function buildConditionResult(condition, status, currentValue, targetValue, progress, message, distanceText = "") {
  return {
    id: condition.id,
    name: condition.name,
    type: condition.type,
    required: condition.required,
    status,
    currentValue,
    targetValue,
    progress,
    message,
    distanceText,
    updatedAt: Date.now(),
  };
}

function defaultFormatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function defaultFormatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function buildDistanceText(current, target, direction, suffix, formatters = {}) {
  const formatNumber = formatters.formatNumber || defaultFormatNumber;
  const formatPercent = formatters.formatPercent || defaultFormatPercent;
  const currentText = suffix === "%" ? formatPercent(current) : `${formatNumber(current, suffix === "x" ? 2 : 6)}${suffix}`;
  const targetText = suffix === "%" ? formatPercent(target) : `${formatNumber(target, suffix === "x" ? 2 : 6)}${suffix}`;

  if (direction === "above") {
    return current >= target ? `当前 ${currentText}，目标 ${targetText}` : `当前 ${currentText}，尚未达到 ${targetText}`;
  }
  return current <= target ? `当前 ${currentText}，目标 ${targetText}` : `当前 ${currentText}，需要低于 ${targetText}`;
}

export function compareCondition(condition, current, target, direction, label, suffix = "", formatters = {}) {
  if (!Number.isFinite(current) || !Number.isFinite(target)) {
    return buildConditionResult(condition, "insufficient_data", current, target, 0, `${label}数据不足`);
  }

  const progress = progressToward(current, target, direction);
  const status = statusFromProgress(progress);
  const comparator = direction === "above" ? "高于" : "低于";
  const message =
    status === "met"
      ? `${label}已${comparator}目标`
      : `${label}尚未${comparator}目标，当前进度 ${Math.round(progress * 100)}%`;
  const distanceText = buildDistanceText(current, target, direction, suffix, formatters);

  return buildConditionResult(condition, status, current, target, progress, message, distanceText);
}

export function conditionResult(condition, context, formatters = {}) {
  if (!context?.candles?.length) {
    return buildConditionResult(condition, "insufficient_data", Number.NaN, null, 0, "行情数据不足");
  }

  const candles = context.candles;
  const price = context.latest.price;

  switch (condition.type) {
    case "price_below":
      return compareCondition(condition, price, condition.params.value, "below", "价格", "", formatters);
    case "price_above":
      return compareCondition(condition, price, condition.params.value, "above", "价格", "", formatters);
    case "change_pct_above":
      return compareCondition(condition, context.latest.changePct, condition.params.value, "above", "区间涨跌幅", "%", formatters);
    case "change_pct_below":
      return compareCondition(condition, context.latest.changePct, condition.params.value, "below", "区间涨跌幅", "%", formatters);
    case "price_above_ma": {
      const ma = calculateMa(candles, condition.params.period);
      return compareCondition(condition, price, ma, "above", `价格 vs MA${condition.params.period}`, "", formatters);
    }
    case "price_below_ma": {
      const ma = calculateMa(candles, condition.params.period);
      return compareCondition(condition, price, ma, "below", `价格 vs MA${condition.params.period}`, "", formatters);
    }
    case "rsi_above": {
      const rsi = calculateRsi(candles, condition.params.period);
      return compareCondition(condition, rsi, condition.params.value, "above", `RSI${condition.params.period}`, "", formatters);
    }
    case "rsi_below": {
      const rsi = calculateRsi(candles, condition.params.period);
      return compareCondition(condition, rsi, condition.params.value, "below", `RSI${condition.params.period}`, "", formatters);
    }
    case "volume_ratio_above": {
      const ratio = calculateVolumeRatio(candles, condition.params.lookback);
      return compareCondition(condition, ratio, condition.params.ratio, "above", "成交量倍数", "x", formatters);
    }
    default:
      return buildConditionResult(condition, "source_error", Number.NaN, null, 0, "暂不支持该条件类型");
  }
}
