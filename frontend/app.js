import {
  deleteBackendDecision,
  fetchBackendAlerts,
  fetchBackendDecisions,
  fetchBackendMe,
  isBackendAvailable,
  loginBackendUser,
  logoutBackendUser,
  registerBackendUser,
  saveBackendAlert,
  saveBackendAlertReview,
  saveBackendDecision,
} from "./modules/api-client.js";
import { createAlertFromResult, shouldCreateAlert, updateActiveSignals, upsertAlertReview } from "../shared/alerts.js";
import { evaluateDecision as evaluateDecisionWithEngine } from "../shared/decision-engine.js";
import { fetchCandles as fetchBinanceCandles, normalizeMarketContext as normalizeBinanceMarketContext } from "../shared/data-source-binance.js";
import { conditionResult as evaluateConditionResult } from "../shared/condition-engine.js";
import { calculateMa as indicatorMa, calculateRsi as indicatorRsi, calculateVolumeRatio as indicatorVolumeRatio } from "../shared/indicators.js";
import { loadJson as storageLoadJson, removeItem, saveJson as storageSaveJson } from "./modules/storage.js";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
} from "../node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.mjs";

const REFRESH_MS = 5000;
const LIMIT = 120;
const ALERT_STORAGE_KEY = "trade-alert-history-v1";
const NOTIFIED_STORAGE_KEY = "trade-alert-notified-v1";
const DECISION_STORAGE_KEY = "trade-alert-user-decisions-v1";
const SYMBOL_STORAGE_KEY = "trade-alert-selected-symbol-v1";
const THEME_STORAGE_KEY = "trade-alert-theme-v1";
const THEME_MIGRATION_STORAGE_KEY = "trade-alert-theme-binance-migrated-v2";
const AUTH_USERS_STORAGE_KEY = "trade-alert-users-v1";
const AUTH_SESSION_STORAGE_KEY = "trade-alert-session-v1";

const THEME_PRESETS = {
  binance: {
    name: "Binance 黑金",
    description: "黑金交易台，卡片克制、重点信息清晰",
    colors: {
      bg: "#0b0e11",
      accent: "#f0b90b",
      line: "#2b3139",
      up: "#0ecb81",
      down: "#f6465d",
      chart: "#f0b90b",
    },
  },
  neon: {
    name: "蓝红量化",
    description: "深蓝底 + 青色线条 + 红绿涨跌",
    colors: {
      bg: "#02050c",
      accent: "#20d7ff",
      line: "#3db0ff",
      up: "#22e58a",
      down: "#ff2d55",
      chart: "#20d7ff",
    },
  },
  matrix: {
    name: "暗盘绿矩阵",
    description: "适合低干扰盯盘，强调上涨与成交量",
    colors: {
      bg: "#020806",
      accent: "#00ff9c",
      line: "#13b981",
      up: "#00ff9c",
      down: "#ff4560",
      chart: "#35f6a5",
    },
  },
  amber: {
    name: "琥珀终端",
    description: "类 Bloomberg 暗金风，适合复盘和学习",
    colors: {
      bg: "#080604",
      accent: "#ffb000",
      line: "#c9822b",
      up: "#3ddc84",
      down: "#ff4d4d",
      chart: "#ffb000",
    },
  },
  violet: {
    name: "紫电策略",
    description: "高对比科技风，适合策略展示",
    colors: {
      bg: "#050414",
      accent: "#a855f7",
      line: "#7c3aed",
      up: "#2dd4bf",
      down: "#fb3f6c",
      chart: "#a855f7",
    },
  },
};

const TIMEFRAME_OPTIONS = [
  { value: "1m", label: "1m" },
  { value: "3m", label: "3m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "30m", label: "30m" },
  { value: "1h", label: "1h" },
  { value: "2h", label: "2h" },
  { value: "4h", label: "4h" },
  { value: "6h", label: "6h" },
  { value: "12h", label: "12h" },
  { value: "1d", label: "1D" },
  { value: "3d", label: "3D" },
  { value: "1w", label: "1W" },
  { value: "1M", label: "1M" },
];

const TOP_MARKET_SYMBOLS = [
  ["BTC", "Bitcoin"],
  ["ETH", "Ethereum"],
  ["USDT", "Tether"],
  ["XRP", "XRP"],
  ["BNB", "BNB"],
  ["SOL", "Solana"],
  ["USDC", "USDC"],
  ["TRX", "TRON"],
  ["DOGE", "Dogecoin"],
  ["ADA", "Cardano"],
  ["HYPE", "Hyperliquid"],
  ["BCH", "Bitcoin Cash"],
  ["SUI", "Sui"],
  ["LINK", "Chainlink"],
  ["LEO", "LEO Token"],
  ["XLM", "Stellar"],
  ["AVAX", "Avalanche"],
  ["TON", "Toncoin"],
  ["SHIB", "Shiba Inu"],
  ["LTC", "Litecoin"],
  ["HBAR", "Hedera"],
  ["WETH", "WETH"],
  ["DOT", "Polkadot"],
  ["UNI", "Uniswap"],
  ["XMR", "Monero"],
  ["BGB", "Bitget Token"],
  ["DAI", "Dai"],
  ["PEPE", "Pepe"],
  ["AAVE", "Aave"],
  ["PI", "Pi Network"],
  ["ENA", "Ethena"],
  ["TAO", "Bittensor"],
  ["CBBTC", "Coinbase Wrapped BTC"],
  ["NEAR", "NEAR Protocol"],
  ["MNT", "Mantle"],
  ["OKB", "OKB"],
  ["ETC", "Ethereum Classic"],
  ["APT", "Aptos"],
  ["ONDO", "Ondo"],
  ["ICP", "Internet Computer"],
  ["CRO", "Cronos"],
  ["POL", "POL"],
  ["KAS", "Kaspa"],
  ["GT", "Gate"],
  ["VET", "VeChain"],
  ["SKY", "Sky"],
  ["ATOM", "Cosmos Hub"],
  ["USD1", "World Liberty Financial USD"],
  ["RENDER", "Render"],
  ["TKX", "Tokenize Xchange"],
  ["FET", "Artificial Superintelligence Alliance"],
  ["FIL", "Filecoin"],
  ["ALGO", "Algorand"],
  ["SEI", "Sei"],
  ["ARB", "Arbitrum"],
  ["JUP", "Jupiter"],
  ["WLD", "Worldcoin"],
  ["ACT", "Act I The AI Prophecy"],
  ["BONK", "Bonk"],
  ["SPX", "SPX6900"],
  ["KCS", "KuCoin"],
  ["FLR", "Flare"],
  ["PUMP", "Pump.fun"],
  ["LBTC", "Lombard Staked BTC"],
  ["XDC", "XDC Network"],
  ["STX", "Stacks"],
  ["FORM", "Four"],
  ["QNT", "Quant"],
  ["FDUSD", "First Digital USD"],
  ["VIRTUAL", "Virtuals Protocol"],
  ["IP", "Story"],
  ["FARTCOIN", "Fartcoin"],
  ["TIA", "Celestia"],
  ["OP", "Optimism"],
  ["S", "Sonic"],
  ["METH", "Mantle Staked Ether"],
  ["IMX", "Immutable"],
  ["XAUT", "Tether Gold"],
  ["WBT", "WhiteBIT Coin"],
  ["PAXG", "PAX Gold"],
  ["NEXO", "NEXO"],
  ["USDS", "USDS"],
  ["FLOKI", "FLOKI"],
  ["GRT", "The Graph"],
  ["JLP", "Jupiter Perpetuals Liquidity Provider Token"],
  ["CAKE", "PancakeSwap"],
  ["A", "Vaulta"],
  ["JASMY", "JasmyCoin"],
  ["LDO", "Lido DAO"],
  ["XTZ", "Tezos"],
  ["IOTA", "IOTA"],
  ["MSOL", "Marinade Staked SOL"],
  ["RAY", "Raydium"],
  ["AERO", "Aerodrome Finance"],
  ["PYUSD", "PayPal USD"],
  ["PENDLE", "Pendle"],
  ["MKR", "Maker"],
  ["THETA", "Theta Network"],
  ["JTO", "Jito"],
  ["FLOW", "Flow"],
  ["ENS", "Ethereum Name Service"],
];

const SYMBOL_OPTIONS = TOP_MARKET_SYMBOLS.map(([base, name], index) => ({ base, name, rank: index + 1 }))
  .filter((item) => item.base !== "USDT")
  .map(({ base, name, rank }) => ({
  rank,
  base,
  name,
  symbol: `${base}USDT`,
  label: `#${rank} ${name} (${base}/USDT)`,
  search: `${rank} ${base} ${name} ${base}USDT`.toLowerCase(),
}));

const state = {
  symbol: SYMBOL_OPTIONS.some((item) => item.symbol === localStorage.getItem(SYMBOL_STORAGE_KEY))
    ? localStorage.getItem(SYMBOL_STORAGE_KEY)
    : "WLDUSDT",
  interval: "1m",
  candles: [],
  contexts: new Map(),
  decisions: [],
  decisionResults: [],
  alerts: loadJson(ALERT_STORAGE_KEY, []),
  notified: loadJson(NOTIFIED_STORAGE_KEY, {}),
  activeSignals: {},
  userDecisions: [],
  editingDecisionId: null,
  editingAlertId: null,
  selectedDecisionId: null,
  chart: null,
  chartType: "candles",
  mainSeries: null,
  markerApi: null,
  ma20Series: null,
  ma60Series: null,
  rsiSeries: null,
  volumeSeries: null,
  priceLines: [],
  candleByTime: new Map(),
  chartResizeObserver: null,
  timer: null,
  isLoading: false,
  hasLoaded: false,
  backendAvailable: false,
  authMode: "login",
  currentUser: null,
};

const els = {
  status: document.querySelector("#connectionStatus"),
  userButton: document.querySelector("#userButton"),
  userAvatar: document.querySelector("#userAvatar"),
  userButtonText: document.querySelector("#userButtonText"),
  symbolSearchInput: document.querySelector("#symbolSearchInput"),
  symbolSelect: document.querySelector("#symbolSelect"),
  symbolPickerButton: document.querySelector("#symbolPickerButton"),
  symbolPickerLabel: document.querySelector("#symbolPickerLabel"),
  symbolPickerMenu: document.querySelector("#symbolPickerMenu"),
  symbolPickerOptions: document.querySelector("#symbolPickerOptions"),
  themePanel: document.querySelector("#themePanel"),
  themeToggleButton: document.querySelector("#themeToggleButton"),
  closeThemeButton: document.querySelector("#closeThemeButton"),
  themePresets: document.querySelector("#themePresets"),
  resetThemeButton: document.querySelector("#resetThemeButton"),
  themeInputs: document.querySelectorAll("[data-theme-color]"),
  intervalTabs: document.querySelector("#intervalTabs"),
  chartTypeTabs: document.querySelector("#chartTypeTabs"),
  ohlcPanel: document.querySelector("#ohlcPanel"),
  refreshButton: document.querySelector("#refreshButton"),
  newDecisionButton: document.querySelector("#newDecisionButton"),
  notifyButton: document.querySelector("#notifyButton"),
  clearAlertsButton: document.querySelector("#clearAlertsButton"),
  lastPrice: document.querySelector("#lastPrice"),
  priceUnit: document.querySelector("#priceUnit"),
  changeValue: document.querySelector("#changeValue"),
  changePercent: document.querySelector("#changePercent"),
  highPrice: document.querySelector("#highPrice"),
  lowPrice: document.querySelector("#lowPrice"),
  chartTitle: document.querySelector("#chartTitle"),
  chartSubtitle: document.querySelector("#chartSubtitle"),
  lastUpdated: document.querySelector("#lastUpdated"),
  volumeValue: document.querySelector("#volumeValue"),
  quoteVolumeValue: document.querySelector("#quoteVolumeValue"),
  candleCount: document.querySelector("#candleCount"),
  chartContainer: document.querySelector("#priceChart"),
  loading: document.querySelector("#loadingState"),
  decisionList: document.querySelector("#decisionList"),
  alertHistory: document.querySelector("#alertHistory"),
  toastStack: document.querySelector("#toastStack"),
  authModal: document.querySelector("#authModal"),
  authBackdrop: document.querySelector("#authBackdrop"),
  closeAuthButton: document.querySelector("#closeAuthButton"),
  authForm: document.querySelector("#authForm"),
  authTitle: document.querySelector("#authTitle"),
  authTabs: document.querySelectorAll("[data-auth-mode]"),
  authNameField: document.querySelector("#authNameField"),
  authEmailInput: document.querySelector("#authEmailInput"),
  authNameInput: document.querySelector("#authNameInput"),
  authPasswordInput: document.querySelector("#authPasswordInput"),
  authSubmitButton: document.querySelector("#authSubmitButton"),
  switchAuthModeButton: document.querySelector("#switchAuthModeButton"),
  accountDrawer: document.querySelector("#accountDrawer"),
  accountBackdrop: document.querySelector("#accountBackdrop"),
  closeAccountButton: document.querySelector("#closeAccountButton"),
  logoutButton: document.querySelector("#logoutButton"),
  accountAvatar: document.querySelector("#accountAvatar"),
  accountName: document.querySelector("#accountName"),
  accountEmail: document.querySelector("#accountEmail"),
  accountDecisionCount: document.querySelector("#accountDecisionCount"),
  accountAlertCount: document.querySelector("#accountAlertCount"),
  accountSymbol: document.querySelector("#accountSymbol"),
  accountTheme: document.querySelector("#accountTheme"),
  accountProvider: document.querySelector("#accountProvider"),
  drawer: document.querySelector("#decisionDrawer"),
  drawerBackdrop: document.querySelector("#drawerBackdrop"),
  closeDrawerButton: document.querySelector("#closeDrawerButton"),
  drawerTitle: document.querySelector("#drawerTitle"),
  drawerSummary: document.querySelector("#drawerSummary"),
  conditionList: document.querySelector("#conditionList"),
  learningCards: document.querySelectorAll("[data-learning-topic]"),
  learningDrawer: document.querySelector("#learningDrawer"),
  learningBackdrop: document.querySelector("#learningBackdrop"),
  closeLearningButton: document.querySelector("#closeLearningButton"),
  learningTitle: document.querySelector("#learningTitle"),
  learningBody: document.querySelector("#learningBody"),
  editor: document.querySelector("#decisionEditor"),
  editorBackdrop: document.querySelector("#editorBackdrop"),
  editorTitle: document.querySelector("#editorTitle"),
  decisionForm: document.querySelector("#decisionForm"),
  closeEditorButton: document.querySelector("#closeEditorButton"),
  cancelEditorButton: document.querySelector("#cancelEditorButton"),
  addConditionButton: document.querySelector("#addConditionButton"),
  conditionEditorList: document.querySelector("#conditionEditorList"),
  decisionNameInput: document.querySelector("#decisionNameInput"),
  decisionSymbolSearchInput: document.querySelector("#decisionSymbolSearchInput"),
  decisionSymbolInput: document.querySelector("#decisionSymbolInput"),
  decisionSymbolPickerButton: document.querySelector("#decisionSymbolPickerButton"),
  decisionSymbolPickerLabel: document.querySelector("#decisionSymbolPickerLabel"),
  decisionSymbolPickerMenu: document.querySelector("#decisionSymbolPickerMenu"),
  decisionSymbolPickerOptions: document.querySelector("#decisionSymbolPickerOptions"),
  decisionTriggerInput: document.querySelector("#decisionTriggerInput"),
  decisionOptionalInput: document.querySelector("#decisionOptionalInput"),
  decisionCooldownInput: document.querySelector("#decisionCooldownInput"),
  decisionNoteInput: document.querySelector("#decisionNoteInput"),
  reviewModal: document.querySelector("#reviewModal"),
  reviewBackdrop: document.querySelector("#reviewBackdrop"),
  reviewForm: document.querySelector("#reviewForm"),
  closeReviewButton: document.querySelector("#closeReviewButton"),
  cancelReviewButton: document.querySelector("#cancelReviewButton"),
  reviewActionInput: document.querySelector("#reviewActionInput"),
  reviewEntryInput: document.querySelector("#reviewEntryInput"),
  reviewStopInput: document.querySelector("#reviewStopInput"),
  reviewTakeProfitInput: document.querySelector("#reviewTakeProfitInput"),
  reviewResultInput: document.querySelector("#reviewResultInput"),
  reviewNoteInput: document.querySelector("#reviewNoteInput"),
};

const DEFAULT_DECISIONS = [
  {
    id: "wld-dip-buy",
    name: "WLD 低吸观察",
    symbol: "WLDUSDT",
    enabled: true,
    triggerMode: "all",
    cooldownMinutes: 30,
    note: "价格回落、动能偏低且成交量开始放大时提醒关注。",
    conditions: [
      {
        id: "wld-price-under-ma20",
        name: "价格低于 MA20",
        type: "price_below_ma",
        source: "binance",
        timeframe: "15m",
        required: true,
        params: { period: 20 },
      },
      {
        id: "wld-rsi-below-45",
        name: "RSI 低于 45",
        type: "rsi_below",
        source: "binance",
        timeframe: "15m",
        required: true,
        params: { period: 14, value: 45 },
      },
      {
        id: "wld-volume-boost",
        name: "成交量达到均量 1.3 倍",
        type: "volume_ratio_above",
        source: "binance",
        timeframe: "15m",
        required: false,
        params: { lookback: 20, ratio: 1.3 },
      },
    ],
  },
  {
    id: "btc-risk-filter",
    name: "BTC 环境过滤",
    symbol: "BTCUSDT",
    enabled: true,
    triggerMode: "required_plus_optional",
    minOptionalMet: 1,
    cooldownMinutes: 45,
    note: "用于判断大盘环境是否过度走弱。",
    conditions: [
      {
        id: "btc-1h-drop-control",
        name: "1 小时跌幅不超过 1.5%",
        type: "change_pct_above",
        source: "binance",
        timeframe: "1h",
        required: true,
        params: { value: -1.5 },
      },
      {
        id: "btc-price-above-ma20",
        name: "价格站上 MA20",
        type: "price_above_ma",
        source: "binance",
        timeframe: "15m",
        required: false,
        params: { period: 20 },
      },
      {
        id: "btc-rsi-above-45",
        name: "RSI 高于 45",
        type: "rsi_above",
        source: "binance",
        timeframe: "15m",
        required: false,
        params: { period: 14, value: 45 },
      },
    ],
  },
  {
    id: "eth-breakout-watch",
    name: "ETH 突破观察",
    symbol: "ETHUSDT",
    enabled: true,
    triggerMode: "required_plus_optional",
    minOptionalMet: 1,
    cooldownMinutes: 45,
    note: "价格强于均线且成交放大时提醒关注突破。",
    conditions: [
      {
        id: "eth-price-above-ma20",
        name: "价格高于 MA20",
        type: "price_above_ma",
        source: "binance",
        timeframe: "15m",
        required: true,
        params: { period: 20 },
      },
      {
        id: "eth-rsi-above-55",
        name: "RSI 高于 55",
        type: "rsi_above",
        source: "binance",
        timeframe: "15m",
        required: false,
        params: { period: 14, value: 55 },
      },
      {
        id: "eth-volume-boost",
        name: "成交量达到均量 1.2 倍",
        type: "volume_ratio_above",
        source: "binance",
        timeframe: "15m",
        required: false,
        params: { lookback: 20, ratio: 1.2 },
      },
    ],
  },
];

state.userDecisions = loadJson(DECISION_STORAGE_KEY, []);
state.decisions = [...DEFAULT_DECISIONS, ...state.userDecisions];

function loadJson(key, fallback) {
  return storageLoadJson(key, fallback);
}

function saveJson(key, value) {
  storageSaveJson(key, value);
}

async function hashPassword(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function initialsForUser(user) {
  const source = user?.name || user?.email || "未";
  return source.trim().slice(0, 1).toUpperCase();
}

function loadUsers() {
  return loadJson(AUTH_USERS_STORAGE_KEY, []);
}

function saveUsers(users) {
  saveJson(AUTH_USERS_STORAGE_KEY, users);
}

function findUserByEmail(email) {
  return loadUsers().find((user) => user.email === normalizeEmail(email));
}

function persistSession(user, token = "") {
  saveJson(AUTH_SESSION_STORAGE_KEY, {
    email: user.email,
    token,
    provider: token ? "backend" : "local",
    signedAt: Date.now(),
  });
}

async function restoreSession() {
  const session = loadJson(AUTH_SESSION_STORAGE_KEY, null);
  if (!session?.email) return;
  if (session.provider === "backend" && session.token && state.backendAvailable) {
    try {
      const result = await fetchBackendMe(session.token);
      state.currentUser = result.user ? { ...result.user, provider: "backend", token: session.token } : null;
      return;
    } catch {
      removeItem(AUTH_SESSION_STORAGE_KEY);
    }
  }
  state.currentUser = findUserByEmail(session.email) || null;
  if (state.currentUser) state.currentUser.provider = "local";
}

function clearSession() {
  const session = loadJson(AUTH_SESSION_STORAGE_KEY, null);
  if (session?.provider === "backend" && session.token && state.backendAvailable) {
    logoutBackendUser(session.token).catch(() => {});
  }
  removeItem(AUTH_SESSION_STORAGE_KEY);
  state.currentUser = null;
}

function updateUserUi() {
  const user = state.currentUser;
  els.userAvatar.textContent = initialsForUser(user);
  els.userButtonText.textContent = user ? user.name || user.email : "登录";
  els.userButton.classList.toggle("signed-in", Boolean(user));
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === "register";
  els.authTitle.textContent = isRegister ? "创建账户" : "登录账户";
  els.authNameField.classList.toggle("hidden", !isRegister);
  els.authSubmitButton.textContent = isRegister ? "注册并登录" : "登录";
  els.switchAuthModeButton.textContent = isRegister ? "已有账户，去登录" : "创建新账户";
  els.authTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.authMode === mode));
}

function openAuthModal(mode = "login") {
  setAuthMode(mode);
  els.authForm.reset();
  els.authModal.classList.remove("hidden");
  els.authBackdrop.classList.remove("hidden");
  window.setTimeout(() => els.authEmailInput.focus(), 0);
}

function closeAuthModal() {
  els.authModal.classList.add("hidden");
  els.authBackdrop.classList.add("hidden");
}

function openAccountDrawer() {
  if (!state.currentUser) {
    openAuthModal("login");
    return;
  }
  const theme = currentTheme();
  els.accountAvatar.textContent = initialsForUser(state.currentUser);
  els.accountName.textContent = state.currentUser.name || "未命名用户";
  els.accountEmail.textContent = state.currentUser.email;
  els.accountDecisionCount.textContent = String(state.userDecisions.length);
  els.accountAlertCount.textContent = String(state.alerts.length);
  els.accountSymbol.textContent = labelForSymbol(state.symbol);
  els.accountTheme.textContent = THEME_PRESETS[theme.preset]?.name || "自定义";
  els.accountProvider.textContent = state.currentUser.provider === "backend" ? "后端账号" : "本地演示";
  els.accountDrawer.classList.remove("hidden");
  els.accountBackdrop.classList.remove("hidden");
}

function closeAccountDrawer() {
  els.accountDrawer.classList.add("hidden");
  els.accountBackdrop.classList.add("hidden");
}

async function handleAuthSubmit() {
  const email = normalizeEmail(els.authEmailInput.value);
  const password = els.authPasswordInput.value;
  const name = els.authNameInput.value.trim();

  if (!email || !password) {
    showToast("信息不完整", "请填写邮箱和密码。");
    return;
  }

  const users = loadUsers();
  const existing = users.find((user) => user.email === email);
  const passwordHash = await hashPassword(password);

  if (state.backendAvailable) {
    try {
      const result =
        state.authMode === "register"
          ? await registerBackendUser({ email, name: name || email.split("@")[0], passwordHash })
          : await loginBackendUser({ email, passwordHash });
      state.currentUser = { ...result.user, provider: "backend", token: result.token };
      persistSession(state.currentUser, result.token);
      updateUserUi();
      closeAuthModal();
      showToast(state.authMode === "register" ? "注册成功" : "登录成功", `${state.currentUser.name || state.currentUser.email}，欢迎回来。`);
      return;
    } catch (error) {
      const message = error.message.includes("409")
        ? "账户已存在，请直接登录。"
        : error.message.includes("401")
          ? "邮箱或密码不正确。"
          : "后端账号服务暂不可用，已尝试本地演示账号。";
      if (error.message.includes("409") || error.message.includes("401")) {
        showToast(state.authMode === "register" ? "注册失败" : "登录失败", message);
        return;
      }
      console.warn("后端登录失败，回退本地演示账号。", error);
    }
  }

  if (state.authMode === "register") {
    if (existing) {
      showToast("账户已存在", "请直接登录，或换一个邮箱注册。");
      return;
    }
    const user = {
      id: `user-${Date.now()}`,
      email,
      name: name || email.split("@")[0],
      passwordHash,
      accountType: "local_demo",
      createdAt: Date.now(),
    };
    users.push(user);
    saveUsers(users);
    state.currentUser = { ...user, provider: "local" };
    persistSession(user);
    updateUserUi();
    closeAuthModal();
    showToast("注册成功", `${user.name}，欢迎进入交易提醒系统。`);
    return;
  }

  const legacyPassword = existing?.password;
  const legacyMatched =
    legacyPassword &&
    legacyPassword === window.btoa(unescape(encodeURIComponent(password)));

  if (!existing || (existing.passwordHash !== passwordHash && !legacyMatched)) {
    showToast("登录失败", "邮箱或密码不正确。");
    return;
  }

  if (legacyMatched) {
    existing.passwordHash = passwordHash;
    existing.accountType = "local_demo";
    delete existing.password;
    saveUsers(users);
  }

  state.currentUser = { ...existing, provider: "local" };
  persistSession(existing);
  updateUserUi();
  closeAuthModal();
  showToast("登录成功", `${existing.name || existing.email}，欢迎回来。`);
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized,
    16,
  );
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbaFromHex(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function currentTheme() {
  const saved = loadJson(THEME_STORAGE_KEY, null);
  if (saved?.preset && !localStorage.getItem(THEME_MIGRATION_STORAGE_KEY) && saved.preset !== "binance") {
    localStorage.setItem(THEME_MIGRATION_STORAGE_KEY, "1");
    const migratedTheme = {
      preset: "binance",
      colors: THEME_PRESETS.binance.colors,
    };
    saveJson(THEME_STORAGE_KEY, migratedTheme);
    return migratedTheme;
  }
  if (saved?.preset) return saved;
  return loadJson(THEME_STORAGE_KEY, {
    preset: "binance",
    colors: THEME_PRESETS.binance.colors,
  });
}

function themeColors() {
  return currentTheme().colors;
}

function applyTheme(theme, shouldSave = true) {
  const colors = { ...THEME_PRESETS.binance.colors, ...(theme.colors || {}) };
  const root = document.documentElement;

  root.style.setProperty("--bg", colors.bg);
  root.style.setProperty("--cyan", colors.accent);
  root.style.setProperty("--blue", colors.line);
  root.style.setProperty("--line", rgbaFromHex(colors.line, 0.28));
  root.style.setProperty("--green", colors.up);
  root.style.setProperty("--red", colors.down);
  root.style.setProperty("--chart-line", colors.chart);
  root.style.setProperty("--chart-line-soft", rgbaFromHex(colors.chart, 0.3));
  root.style.setProperty("--panel", rgbaFromHex(colors.bg, 0.84));
  root.style.setProperty("--panel-2", rgbaFromHex(colors.bg, 0.72));

  els.themeInputs.forEach((input) => {
    input.value = colors[input.dataset.themeColor];
  });

  document.body.dataset.themePreset = theme.preset || "custom";
  [...els.themePresets.querySelectorAll("[data-theme-preset]")].forEach((button) => {
    button.classList.toggle("active", button.dataset.themePreset === theme.preset);
  });

  if (state.candles.length) drawChart(state.candles);
  if (shouldSave) saveJson(THEME_STORAGE_KEY, { preset: theme.preset || "custom", colors });
}

function openThemePanel() {
  els.themePanel.classList.remove("hidden");
  els.themeToggleButton.classList.add("active");
}

function closeThemePanel() {
  els.themePanel.classList.add("hidden");
  els.themeToggleButton.classList.remove("active");
}

function toggleThemePanel() {
  if (els.themePanel.classList.contains("hidden")) {
    openThemePanel();
    return;
  }
  closeThemePanel();
}

function renderThemePresets() {
  els.themePresets.innerHTML = Object.entries(THEME_PRESETS)
    .map(
      ([id, preset]) => `
        <button type="button" data-theme-preset="${id}">
          <span>${preset.name}</span>
          <small>${preset.description}</small>
        </button>
      `,
    )
    .join("");
}

const CONDITION_TYPES = [
  { value: "price_below", label: "价格低于", fields: ["value"], defaultName: "价格低于目标" },
  { value: "price_above", label: "价格高于", fields: ["value"], defaultName: "价格高于目标" },
  { value: "change_pct_above", label: "区间涨跌幅高于", fields: ["value"], defaultName: "区间涨跌幅高于目标" },
  { value: "change_pct_below", label: "区间涨跌幅低于", fields: ["value"], defaultName: "区间涨跌幅低于目标" },
  { value: "price_above_ma", label: "价格高于 MA", fields: ["period"], defaultName: "价格高于 MA" },
  { value: "price_below_ma", label: "价格低于 MA", fields: ["period"], defaultName: "价格低于 MA" },
  { value: "rsi_above", label: "RSI 高于", fields: ["period", "value"], defaultName: "RSI 高于目标" },
  { value: "rsi_below", label: "RSI 低于", fields: ["period", "value"], defaultName: "RSI 低于目标" },
  { value: "volume_ratio_above", label: "成交量倍数高于", fields: ["lookback", "ratio"], defaultName: "成交量放大" },
];

function conditionTypeConfig(type) {
  return CONDITION_TYPES.find((item) => item.value === type) || CONDITION_TYPES[0];
}

function createEmptyCondition(index = 0) {
  return {
    id: `cond-${Date.now()}-${index}`,
    name: "",
    type: "price_below",
    source: "binance",
    timeframe: "15m",
    required: true,
    params: { value: 0 },
  };
}

function refreshDecisionList() {
  state.decisions = [...DEFAULT_DECISIONS, ...state.userDecisions];
}

function saveUserDecisions() {
  saveJson(DECISION_STORAGE_KEY, state.userDecisions);
  refreshDecisionList();
}

async function initializeBackendData() {
  state.backendAvailable = await isBackendAvailable();
  if (!state.backendAvailable) return;

  try {
    const [backendDecisions, backendAlerts] = await Promise.all([fetchBackendDecisions(), fetchBackendAlerts()]);

    if (Array.isArray(backendDecisions) && backendDecisions.length) {
      state.userDecisions = backendDecisions;
      saveJson(DECISION_STORAGE_KEY, state.userDecisions);
      refreshDecisionList();
    } else if (state.userDecisions.length) {
      await Promise.allSettled(state.userDecisions.map((decision) => saveBackendDecision(decision)));
    }

    if (Array.isArray(backendAlerts) && backendAlerts.length) {
      state.alerts = backendAlerts;
      saveJson(ALERT_STORAGE_KEY, state.alerts);
    } else if (state.alerts.length) {
      await Promise.allSettled(state.alerts.map((alert) => saveBackendAlert(alert)));
    }
  } catch (error) {
    state.backendAvailable = false;
    console.warn("后端同步不可用，继续使用本地数据。", error);
  }
}

function persistDecisionToBackend(decision) {
  if (!state.backendAvailable) return;
  saveBackendDecision(decision).catch((error) => {
    console.warn("后端保存决策失败，已保留本地数据。", error);
  });
}

function deleteDecisionFromBackend(decisionId) {
  if (!state.backendAvailable) return;
  deleteBackendDecision(decisionId).catch((error) => {
    console.warn("后端删除决策失败，本地删除已完成。", error);
  });
}

function persistAlertToBackend(alert) {
  if (!state.backendAvailable) return;
  saveBackendAlert(alert).catch((error) => {
    console.warn("后端保存提醒失败，已保留本地数据。", error);
  });
}

function persistAlertReviewToBackend(alertId, review) {
  if (!state.backendAvailable) return;
  saveBackendAlertReview(alertId, review).catch((error) => {
    console.warn("后端保存复盘失败，已保留本地数据。", error);
  });
}

const LEARNING_TOPICS = {
  "kline-tools": {
    title: "K线与画图工具",
    intro: "K线图不是用来预测未来的水晶球，而是把价格、成交量、波动和市场节奏压缩到一张图里。一个交易员看K线，核心是先判断市场环境，再决定要不要使用某个策略。",
    visual: "candles",
    sections: [
      {
        heading: "一根K线读什么",
        body: "每根K线包含开盘价、最高价、最低价、收盘价。实体越长，说明这一段时间买卖一方更主动；影线越长，说明价格曾经冲出去但被拉回，市场有分歧。",
        example: "例子：如果价格向下插针后收回，并且成交量明显放大，普通交易员不应立刻认为反转，而是先观察下一根或几根K线是否站回关键均线。",
      },
      {
        heading: "专业画K线工具怎么选",
        body: "TradingView Lightweight Charts 适合做专业行情图；Apache ECharts 适合学习图、指标对比和多维仪表盘；Highcharts Stock 成熟但更偏商业产品。我们后续升级时，优先接 Lightweight Charts。",
        example: "落地建议：行情主图用 Lightweight Charts，学习板块里的指标教学图继续用轻量SVG或ECharts，避免首屏过重。",
      },
    ],
  },
  indicators: {
    title: "核心技术指标深度解读",
    intro: "指标不是越多越好。成熟策略通常把指标分成四类：趋势、动能、成交量、波动。每类选1到2个就够，关键是知道它们分别回答什么问题。",
    visual: "indicators",
    sections: [
      {
        heading: "MA / EMA：趋势方向",
        body: "MA是均线，回答“价格相对过去一段时间是强还是弱”。EMA更重视近期价格，反应更快。价格长期在MA20上方，说明短期趋势偏强；跌破后又站回，可能代表趋势修复。",
        example: "策略例子：价格低于MA20时不追涨；当价格重新站上MA20，且成交量放大到过去20根均量的1.2倍，再考虑突破提醒。",
      },
      {
        heading: "RSI：动能是否过热或过冷",
        body: "RSI衡量上涨和下跌力量的相对强弱。RSI低于30常被视为偏冷，高于70常被视为偏热。但单看RSI容易误判，强趋势里RSI可以长期高位或低位。",
        example: "策略例子：抄底不是看到RSI < 30就买，而是 RSI < 35 后开始回升，同时价格不再创新低，再叠加成交量恢复。",
      },
      {
        heading: "MACD：趋势动能变化",
        body: "MACD看的是快慢均线差值。金叉通常代表动能转强，死叉代表动能转弱；柱体从负值缩短，说明下跌动能减弱。",
        example: "策略例子：价格仍在低位，但MACD绿柱连续缩短，同时RSI抬升，这比单纯“价格便宜”更值得关注。",
      },
      {
        heading: "成交量：信号是否有人参与",
        body: "没有成交量配合的突破容易是假突破。成交量放大说明市场参与度提高，但也要区分是主动买入还是恐慌卖出。",
        example: "策略例子：突破前高时，成交量至少高于20根均量的1.2倍；如果价格突破但量能萎缩，只标记为观察，不触发提醒。",
      },
      {
        heading: "布林带：波动区间",
        body: "布林带观察价格相对波动区间的位置。贴近上轨说明强势但可能过热，跌到下轨说明弱势但不一定便宜；带宽收窄代表波动压缩，可能酝酿方向选择。",
        example: "策略例子：布林带收窄后，价格放量突破上轨，并且RSI未极端过热，可以作为趋势启动提醒。",
      },
    ],
  },
  "system-path": {
    title: "策略搭建路径",
    intro: "一个交易系统不是一堆指标，而是一套回答问题的流程：什么市场环境适合做？什么信号出现才提醒？什么情况必须放弃？",
    visual: "system",
    sections: [
      {
        heading: "第一步：定义交易场景",
        body: "先区分你要做的是抄底、突破、回调买入、趋势跟随，还是风险规避。不同场景需要的指标完全不同。",
        example: "例子：BTC抄底1 = 价格回撤 + RSI低位修复 + 成交量恢复；ETH突破1 = 价格站上MA20 + 放量 + RSI强于55。",
      },
      {
        heading: "第二步：把想法拆成条件",
        body: "把模糊判断改成可计算条件：价格低于某值、价格站上MA、RSI低于或高于某阈值、成交量倍数高于均量。",
        example: "例子：不要写“感觉跌够了”，而是写“价格低于0.45，RSI14低于35后回升，成交量高于20根均量1.2倍”。",
      },
      {
        heading: "第三步：设置必选和可选",
        body: "必选条件是没有它就不能交易；可选条件是增强信心。这样可以避免策略太死，也避免提醒太多。",
        example: "例子：必选 = 价格进入目标区间、RSI修复；可选 = 成交量放大、MACD绿柱缩短、价格站回MA20。",
      },
    ],
  },
  "alert-flow": {
    title: "从学习到提醒",
    intro: "学习指标的最终目的，是把它们变成可执行的提醒，而不是每天盯盘焦虑。提醒系统只负责告诉你“条件接近或满足”，最终下单仍由你人工确认。",
    visual: "flow",
    sections: [
      {
        heading: "把指标翻译成提醒语言",
        body: "每个提醒都应该包含交易对、周期、指标、阈值和触发方式。周期尤其重要：1分钟适合短线观察，4小时和日线更适合大方向。",
        example: "例子：ACT/USDT，15m周期，价格高于MA20，RSI14高于55，成交量高于20根均量1.2倍，三个条件同时满足才提醒。",
      },
      {
        heading: "看进度，而不是只看触发",
        body: "一个好系统要显示每个条件离达成还差多少。这样你不是被提醒牵着走，而是能提前观察策略是否正在形成。",
        example: "例子：RSI已满足，价格距离MA20还差0.8%，成交量只达到目标的70%。这时更适合观察，而不是提前下单。",
      },
      {
        heading: "复盘提醒质量",
        body: "每次提醒后记录结果：是否误报、是否错过、是否条件太宽或太严。策略不是一次写完的，是靠复盘慢慢打磨的。",
        example: "例子：如果连续多次触发后都冲高回落，可能需要增加“回踩不破MA”或“突破后成交量持续”的过滤条件。",
      },
    ],
  },
};

function learningVisual(type) {
  if (type === "candles") {
    return `
      <svg class="learning-visual" viewBox="0 0 520 180" role="img" aria-label="K线示意图">
        <line x1="28" y1="142" x2="492" y2="142" />
        <line x1="28" y1="34" x2="28" y2="142" />
        <g class="candle up"><line x1="88" y1="58" x2="88" y2="128" /><rect x="74" y="78" width="28" height="38" /></g>
        <g class="candle down"><line x1="150" y1="44" x2="150" y2="132" /><rect x="136" y="58" width="28" height="56" /></g>
        <g class="candle up"><line x1="212" y1="48" x2="212" y2="126" /><rect x="198" y="68" width="28" height="34" /></g>
        <g class="candle up"><line x1="274" y1="38" x2="274" y2="110" /><rect x="260" y="54" width="28" height="42" /></g>
        <g class="candle down"><line x1="336" y1="50" x2="336" y2="136" /><rect x="322" y="70" width="28" height="46" /></g>
        <path d="M70 132 C142 106, 196 118, 252 82 S390 78, 456 44" />
        <text x="354" y="38">趋势线</text>
      </svg>
    `;
  }

  if (type === "indicators") {
    return `
      <svg class="learning-visual" viewBox="0 0 520 180" role="img" aria-label="指标示意图">
        <line x1="28" y1="138" x2="492" y2="138" />
        <path class="price-line" d="M42 126 L86 116 L130 122 L174 92 L218 84 L262 96 L306 70 L350 78 L394 54 L438 62 L480 42" />
        <path class="ma-line" d="M42 132 C120 126, 168 112, 224 100 S332 86, 480 64" />
        <line class="rsi-high" x1="34" y1="42" x2="486" y2="42" />
        <line class="rsi-low" x1="34" y1="124" x2="486" y2="124" />
        <text x="42" y="32">RSI 70 过热区</text>
        <text x="42" y="158">MA/EMA 趋势线</text>
      </svg>
    `;
  }

  if (type === "system") {
    return `
      <div class="flow-visual">
        <span>场景</span>
        <strong>→</strong>
        <span>指标</span>
        <strong>→</strong>
        <span>条件</span>
        <strong>→</strong>
        <span>提醒</span>
        <strong>→</strong>
        <span>复盘</span>
      </div>
    `;
  }

  return `
    <div class="flow-visual alert">
      <span>学习指标</span>
      <strong>→</strong>
      <span>组合策略</span>
      <strong>→</strong>
      <span>监控进度</span>
      <strong>→</strong>
      <span>人工决策</span>
    </div>
  `;
}

function openLearningDrawer(topicId) {
  const topic = LEARNING_TOPICS[topicId];
  if (!topic) return;

  els.learningTitle.textContent = topic.title;
  els.learningBody.innerHTML = `
    <p class="learning-intro">${topic.intro}</p>
    ${learningVisual(topic.visual)}
    <div class="learning-detail-list">
      ${topic.sections
        .map(
          (section) => `
            <article class="learning-detail-card">
              <h3>${section.heading}</h3>
              <p>${section.body}</p>
              <div class="learning-example">
                <strong>交易例子</strong>
                <p>${section.example}</p>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
  els.learningDrawer.classList.remove("hidden");
  els.learningBackdrop.classList.remove("hidden");
}

function closeLearningDrawer() {
  els.learningDrawer.classList.add("hidden");
  els.learningBackdrop.classList.add("hidden");
}

function renderSymbolOptions(selectEl, query = "", selected = "") {
  const normalized = query.trim().toLowerCase();
  const matches = SYMBOL_OPTIONS.filter((item) => !normalized || item.search.includes(normalized));
  const visible = matches.slice(0, 100);
  const selectedOption =
    SYMBOL_OPTIONS.find((item) => item.symbol === selected) ||
    SYMBOL_OPTIONS.find((item) => item.base === "WLD") ||
    SYMBOL_OPTIONS[0];

  if (!normalized && selected && !visible.some((item) => item.symbol === selected)) {
    visible.unshift(selectedOption);
  }

  selectEl.innerHTML = visible
    .map(
      (item) =>
        `<option value="${item.symbol}" ${item.symbol === selectedOption.symbol ? "selected" : ""}>${item.label}</option>`,
    )
    .join("");
}

function syncSymbolSearch(inputEl, selectEl, selected) {
  renderSymbolOptions(selectEl, inputEl.value, selected);
}

function getSymbolOption(symbol) {
  return SYMBOL_OPTIONS.find((item) => item.symbol === symbol) || SYMBOL_OPTIONS.find((item) => item.base === "WLD") || SYMBOL_OPTIONS[0];
}

function setSymbolPickerLabel(labelEl, symbol) {
  const option = getSymbolOption(symbol);
  labelEl.textContent = option ? option.label.replace(/^#\d+\s+/, "") : symbol.replace("USDT", "/USDT");
}

function getSymbolPickerParts(kind) {
  if (kind === "decision") {
    return {
      select: els.decisionSymbolInput,
      input: els.decisionSymbolSearchInput,
      button: els.decisionSymbolPickerButton,
      label: els.decisionSymbolPickerLabel,
      menu: els.decisionSymbolPickerMenu,
      options: els.decisionSymbolPickerOptions,
    };
  }

  return {
    select: els.symbolSelect,
    input: els.symbolSearchInput,
    button: els.symbolPickerButton,
    label: els.symbolPickerLabel,
    menu: els.symbolPickerMenu,
    options: els.symbolPickerOptions,
  };
}

function renderSymbolPickerOptions(kind, query = "") {
  const parts = getSymbolPickerParts(kind);
  const normalized = query.trim().toLowerCase();
  const matches = SYMBOL_OPTIONS.filter((item) => !normalized || item.search.includes(normalized)).slice(0, 100);

  parts.options.innerHTML = matches.length
    ? matches
        .map(
          (item) => `
            <button type="button" class="${item.symbol === parts.select.value ? "active" : ""}" data-symbol="${item.symbol}">
              <span>${item.base}/USDT</span>
              <small>#${item.rank} ${item.name}</small>
            </button>
          `,
        )
        .join("")
    : `<div class="symbol-picker-empty">没有匹配的交易对</div>`;
}

function setSymbolSelection(kind, symbol, shouldLoad = false) {
  const parts = getSymbolPickerParts(kind);
  renderSymbolOptions(parts.select, "", symbol);
  parts.select.value = symbol;
  parts.input.value = "";
  setSymbolPickerLabel(parts.label, symbol);
  renderSymbolPickerOptions(kind, "");

  if (kind === "market") {
    state.symbol = symbol;
    localStorage.setItem(SYMBOL_STORAGE_KEY, symbol);
    if (shouldLoad) {
      loadMarket();
      resetTimer();
    }
  }
}

function openSymbolPicker(kind) {
  const parts = getSymbolPickerParts(kind);
  closeSymbolPickers(kind);
  parts.menu.classList.remove("hidden");
  parts.button.classList.add("active");
  renderSymbolPickerOptions(kind, parts.input.value);
  window.setTimeout(() => parts.input.focus(), 0);
}

function closeSymbolPickers(exceptKind = "") {
  ["market", "decision"].forEach((kind) => {
    if (kind === exceptKind) return;
    const parts = getSymbolPickerParts(kind);
    parts.menu.classList.add("hidden");
    parts.button.classList.remove("active");
  });
}

function bindSymbolPicker(kind) {
  const parts = getSymbolPickerParts(kind);

  parts.button.addEventListener("click", () => {
    if (parts.menu.classList.contains("hidden")) openSymbolPicker(kind);
    else closeSymbolPickers();
  });

  parts.input.addEventListener("input", () => {
    renderSymbolPickerOptions(kind, parts.input.value);
  });

  parts.options.addEventListener("click", (event) => {
    const optionButton = event.target.closest("[data-symbol]");
    if (!optionButton) return;
    setSymbolSelection(kind, optionButton.dataset.symbol, kind === "market");
    closeSymbolPickers();
  });
}

function labelForSymbol(symbol) {
  const option = SYMBOL_OPTIONS.find((item) => item.symbol === symbol);
  return option ? `${option.base}/USDT` : symbol.replace("USDT", "/USDT");
}

function renderIntervalTabs() {
  els.intervalTabs.innerHTML = TIMEFRAME_OPTIONS.map(
    (item) =>
      `<button type="button" class="${item.value === state.interval ? "active" : ""}" data-interval="${item.value}">${item.label}</button>`,
  ).join("");
}

function renderChartTypeTabs() {
  els.chartTypeTabs.querySelectorAll("[data-chart-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.chartType === state.chartType);
  });
}

function setStatus(kind, text) {
  els.status.className = `status-pill ${kind || ""}`.trim();
  els.status.querySelector("span:last-child").textContent = text;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "--";
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(6);
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatCompact(value) {
  if (!Number.isFinite(value)) return "--";
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function parseCandle(row) {
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

async function fetchCandles(symbol, interval, limit = LIMIT) {
  return fetchBinanceCandles(symbol, interval, limit);
}

async function getMarketContext(symbol, timeframe) {
  const key = `${symbol}:${timeframe}`;
  if (state.contexts.has(key)) return state.contexts.get(key);

  const candles = await fetchCandles(symbol, timeframe, LIMIT);
  const context = normalizeMarketContext({ source: "binance", symbol, timeframe, candles });
  state.contexts.set(key, context);
  return context;
}

function normalizeMarketContext({ source, symbol, timeframe, candles }) {
  return normalizeBinanceMarketContext({ source, symbol, timeframe, candles });
}

function average(values) {
  if (!values.length) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateMa(candles, period) {
  return indicatorMa(candles, period);
}

function calculateRsi(candles, period = 14) {
  return indicatorRsi(candles, period);
}

function calculateVolumeRatio(candles, lookback = 20) {
  return indicatorVolumeRatio(candles, lookback);
}

function progressToward(current, target, direction) {
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

function statusFromProgress(progress) {
  if (progress >= 1) return "met";
  if (progress >= 0.85) return "near";
  return "unmet";
}

function conditionResult(condition, context) {
  return evaluateConditionResult(condition, context, { formatNumber, formatPercent });
}

function compareCondition(condition, current, target, direction, label, suffix = "") {
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
  const distanceText = buildDistanceText(current, target, direction, suffix);

  return buildConditionResult(condition, status, current, target, progress, message, distanceText);
}

function buildConditionResult(condition, status, currentValue, targetValue, progress, message, distanceText = "") {
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

function buildDistanceText(current, target, direction, suffix) {
  const currentText = suffix === "%" ? formatPercent(current) : `${formatNumber(current, suffix === "x" ? 2 : 6)}${suffix}`;
  const targetText = suffix === "%" ? formatPercent(target) : `${formatNumber(target, suffix === "x" ? 2 : 6)}${suffix}`;

  if (direction === "above") {
    return current >= target ? `当前 ${currentText}，目标 ${targetText}` : `当前 ${currentText}，距离目标 ${targetText}`;
  }
  return current <= target ? `当前 ${currentText}，目标 ${targetText}` : `当前 ${currentText}，目标 ${targetText}`;
}

async function evaluateDecision(decision) {
  return evaluateDecisionWithEngine(decision, getMarketContext, { formatNumber, formatPercent });
}

function updateSummary(context) {
  const candles = context.candles;
  const latest = context.latest;
  const quote = context.symbol.endsWith("USDT") ? "USDT" : "";

  els.lastPrice.textContent = formatPrice(latest.price);
  els.priceUnit.textContent = quote;
  els.changeValue.textContent = `${latest.change >= 0 ? "+" : ""}${formatPrice(latest.change)}`;
  els.changePercent.textContent = formatPercent(latest.changePct);
  els.highPrice.textContent = formatPrice(latest.high);
  els.lowPrice.textContent = formatPrice(latest.low);
  els.volumeValue.textContent = formatCompact(latest.volume);
  els.quoteVolumeValue.textContent = `${formatCompact(latest.quoteVolume)} ${quote}`;
  els.candleCount.textContent = String(candles.length);

  els.changeValue.classList.toggle("positive", latest.change >= 0);
  els.changeValue.classList.toggle("negative", latest.change < 0);
  els.changePercent.classList.toggle("positive", latest.change >= 0);
  els.changePercent.classList.toggle("negative", latest.change < 0);

  els.chartTitle.textContent = `${context.symbol.replace("USDT", "/USDT")} 价格曲线`;
  els.chartSubtitle.textContent = `最近 ${candles.length} 根 ${context.timeframe} K 线`;
  els.lastUpdated.textContent = `更新于 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
}

function drawChart(candles) {
  const colors = themeColors();
  ensureProfessionalChart();
  ensureMainSeries();
  applyProfessionalChartTheme(colors);

  const candleData = candles.map((item) => ({
    time: Math.floor(item.openTime / 1000),
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
  }));
  const closeLineData = candles.map((item) => ({
    time: Math.floor(item.openTime / 1000),
    value: item.close,
  }));
  const volumeData = candles.map((item) => ({
    time: Math.floor(item.openTime / 1000),
    value: item.volume,
    color: item.close >= item.open ? rgbaFromHex(colors.up, 0.52) : rgbaFromHex(colors.down, 0.52),
  }));

  state.candleByTime = new Map(candles.map((item) => [Math.floor(item.openTime / 1000), item]));
  if (state.chartType === "candles") state.mainSeries.setData(candleData);
  else state.mainSeries.setData(closeLineData);
  state.volumeSeries.setData(volumeData);
  state.ma20Series.setData(calculateMovingAverageSeries(candles, 20));
  state.ma60Series.setData(calculateMovingAverageSeries(candles, 60));
  state.rsiSeries.setData(calculateRsiSeries(candles, 14));
  updateStrategyMarkers(candles);
  updateStrategyPriceLines();
  updateOhlcPanel(candles[candles.length - 1]);
  state.chart.timeScale().fitContent();
}

function chartTypeDefinition() {
  if (state.chartType === "line") return LineSeries;
  if (state.chartType === "area") return AreaSeries;
  return CandlestickSeries;
}

function chartTypeSeriesName() {
  if (state.chartType === "line") return "line";
  if (state.chartType === "area") return "area";
  return "candlestick";
}

function chartTypeOptions(colors = themeColors()) {
  if (state.chartType === "line") {
    return {
      color: colors.chart,
      lineWidth: 2,
      priceLineColor: colors.chart,
    };
  }
  if (state.chartType === "area") {
    return {
      lineColor: colors.chart,
      topColor: rgbaFromHex(colors.chart, 0.35),
      bottomColor: rgbaFromHex(colors.chart, 0.03),
      lineWidth: 2,
      priceLineColor: colors.chart,
    };
  }
  return {
    upColor: colors.up,
    downColor: colors.down,
    borderUpColor: colors.up,
    borderDownColor: colors.down,
    wickUpColor: colors.up,
    wickDownColor: colors.down,
    priceLineColor: colors.chart,
  };
}

function ensureMainSeries() {
  if (state.mainSeries?.seriesType?.()?.toLowerCase() === chartTypeSeriesName()) return;
  if (state.markerApi) {
    state.markerApi.setMarkers([]);
    state.markerApi = null;
  }
  if (state.mainSeries) {
    state.priceLines = [];
    state.chart.removeSeries(state.mainSeries);
  }
  state.mainSeries = state.chart.addSeries(chartTypeDefinition(), chartTypeOptions(), 0);
  state.markerApi = createSeriesMarkers(state.mainSeries, []);
}

function ensureProfessionalChart() {
  if (state.chart) return;

  const rect = els.chartContainer.getBoundingClientRect();
  state.chart = createChart(els.chartContainer, {
    width: Math.max(320, Math.round(rect.width)),
    height: Math.max(320, Math.round(rect.height)),
    autoSize: true,
    layout: {
      type: ColorType.Solid,
      background: { color: themeColors().bg },
      textColor: "#9aa4b2",
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: rgbaFromHex(themeColors().line, 0.22) },
      horzLines: { color: rgbaFromHex(themeColors().line, 0.22) },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
    },
    rightPriceScale: {
      borderColor: rgbaFromHex(themeColors().line, 0.32),
      scaleMargins: { top: 0.08, bottom: 0.24 },
    },
    timeScale: {
      borderColor: rgbaFromHex(themeColors().line, 0.32),
      timeVisible: true,
      secondsVisible: false,
    },
  });

  state.volumeSeries = state.chart.addSeries(HistogramSeries, {
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
  });
  state.chart.priceScale("volume").applyOptions({
    scaleMargins: { top: 0.78, bottom: 0 },
  });
  state.ma20Series = state.chart.addSeries(LineSeries, {
    color: "#f0b90b",
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    title: "MA20",
  });
  state.ma60Series = state.chart.addSeries(LineSeries, {
    color: "#8b5cf6",
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    title: "MA60",
  });
  state.rsiSeries = state.chart.addSeries(LineSeries, {
    color: "#38bdf8",
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: true,
    title: "RSI14",
  }, 1);
  state.rsiSeries.createPriceLine({
    price: 70,
    color: rgbaFromHex(themeColors().down, 0.72),
    lineWidth: 1,
    lineStyle: 2,
    axisLabelVisible: true,
    title: "RSI 70",
  });
  state.rsiSeries.createPriceLine({
    price: 30,
    color: rgbaFromHex(themeColors().up, 0.72),
    lineWidth: 1,
    lineStyle: 2,
    axisLabelVisible: true,
    title: "RSI 30",
  });
  state.rsiSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.1, bottom: 0.1 },
  });

  state.chart.subscribeCrosshairMove((param) => {
    if (!param?.time) {
      updateOhlcPanel(state.candles[state.candles.length - 1]);
      return;
    }
    updateOhlcPanel(state.candleByTime.get(param.time));
  });

  state.chartResizeObserver = new ResizeObserver(() => {
    const nextRect = els.chartContainer.getBoundingClientRect();
    state.chart.resize(Math.max(320, Math.round(nextRect.width)), Math.max(320, Math.round(nextRect.height)));
  });
  state.chartResizeObserver.observe(els.chartContainer);
}

function applyProfessionalChartTheme(colors) {
  if (!state.chart || !state.mainSeries || !state.volumeSeries) return;
  state.chart.applyOptions({
    layout: {
      type: ColorType.Solid,
      background: { color: colors.bg },
      textColor: "#9aa4b2",
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: rgbaFromHex(colors.line, 0.22) },
      horzLines: { color: rgbaFromHex(colors.line, 0.22) },
    },
    rightPriceScale: {
      borderColor: rgbaFromHex(colors.line, 0.32),
    },
    timeScale: {
      borderColor: rgbaFromHex(colors.line, 0.32),
    },
  });
  state.mainSeries.applyOptions(chartTypeOptions(colors));
  state.ma20Series.applyOptions({ color: colors.chart });
  state.ma60Series.applyOptions({ color: rgbaFromHex(colors.line, 0.95) });
  state.rsiSeries.applyOptions({ color: "#38bdf8" });
}

function calculateMovingAverageSeries(candles, period) {
  const points = [];
  for (let index = period - 1; index < candles.length; index += 1) {
    const slice = candles.slice(index - period + 1, index + 1);
    points.push({
      time: Math.floor(candles[index].openTime / 1000),
      value: indicatorMa(slice, period),
    });
  }
  return points.filter((item) => Number.isFinite(item.value));
}

function calculateRsiSeries(candles, period = 14) {
  const points = [];
  for (let index = period; index < candles.length; index += 1) {
    const value = indicatorRsi(candles.slice(0, index + 1), period);
    if (Number.isFinite(value)) {
      points.push({
        time: Math.floor(candles[index].openTime / 1000),
        value,
      });
    }
  }
  return points;
}

function updateOhlcPanel(candle) {
  if (!candle) return;
  els.ohlcPanel.innerHTML = `
    <span>O <strong>${formatPrice(candle.open)}</strong></span>
    <span>H <strong>${formatPrice(candle.high)}</strong></span>
    <span>L <strong>${formatPrice(candle.low)}</strong></span>
    <span>C <strong>${formatPrice(candle.close)}</strong></span>
    <span>V <strong>${formatCompact(candle.volume)}</strong></span>
  `;
}

function nearestCandleTime(timestamp, candles = state.candles) {
  if (!candles.length) return null;
  const target = timestamp || Date.now();
  let nearest = candles[0];
  for (const candle of candles) {
    if (Math.abs(candle.openTime - target) < Math.abs(nearest.openTime - target)) nearest = candle;
  }
  return Math.floor(nearest.openTime / 1000);
}

function updateStrategyMarkers(candles) {
  if (!state.markerApi || !candles.length) return;
  const markers = state.alerts
    .filter((alert) => alert.symbol === state.symbol)
    .slice(0, 30)
    .map((alert) => ({
      time: nearestCandleTime(alert.createdAt, candles),
      position: "aboveBar",
      color: themeColors().chart,
      shape: "circle",
      text: "提醒",
    }))
    .filter((marker) => marker.time);
  state.markerApi.setMarkers(markers);
}

function updateStrategyPriceLines() {
  if (!state.mainSeries) return;
  state.priceLines.forEach((line) => state.mainSeries.removePriceLine(line));
  state.priceLines = [];
  const colors = themeColors();
  const decisions = state.decisions.filter((decision) => decision.symbol === state.symbol);
  decisions.forEach((decision) => {
    decision.conditions
      .filter((condition) => ["price_below", "price_above"].includes(condition.type) && Number.isFinite(condition.params?.value))
      .forEach((condition) => {
        state.priceLines.push(
          state.mainSeries.createPriceLine({
            price: condition.params.value,
            color: condition.type === "price_above" ? colors.up : colors.down,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `${condition.name || decision.name}`,
          }),
        );
      });
  });
}

function renderDecisions() {
  if (!state.decisionResults.length) {
    els.decisionList.innerHTML = `<div class="empty-state">正在评估决策条件...</div>`;
    return;
  }

  els.decisionList.innerHTML = state.decisionResults
    .map((result) => {
      const statusText = result.status === "ready" ? "可提醒" : result.status === "near" ? "接近触发" : "观察中";
      const updated = new Date(result.updatedAt).toLocaleTimeString("zh-CN", { hour12: false });
      return `
        <article class="decision-card" data-decision-id="${result.decision.id}">
          <div class="decision-top">
            <h3>${escapeHtml(result.decision.name)}</h3>
            <div class="decision-card-actions">
              ${result.decision.custom ? `<button type="button" class="mini-button" data-action="edit" data-decision-id="${result.decision.id}">编辑</button>` : ""}
              ${result.decision.custom ? `<button type="button" class="mini-button" data-action="delete" data-decision-id="${result.decision.id}">删除</button>` : ""}
              <span class="decision-status ${result.status}">${statusText}</span>
            </div>
          </div>
          <div class="decision-meta">
            <span>${labelForSymbol(result.decision.symbol)}</span>
            <span>${result.metCount}/${result.totalCount} 条件满足</span>
            <span>${updated}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${Math.round(result.progress * 100)}%"></div>
          </div>
          <p class="decision-reason">${escapeHtml(result.reason)}</p>
        </article>
      `;
    })
    .join("");
}

function renderAlertHistory() {
  const alerts = state.alerts.slice(0, 8);
  if (!alerts.length) {
    els.alertHistory.innerHTML = `<div class="empty-state">暂无提醒记录</div>`;
    return;
  }

  els.alertHistory.innerHTML = alerts
    .map((alert) => {
      const time = new Date(alert.createdAt).toLocaleString("zh-CN", { hour12: false });
      const review = normalizeReview(alert.review);
      const reviewText = REVIEW_RESULT_LABELS[review.result] || "未复盘";
      const actionText = REVIEW_ACTION_LABELS[review.action] || "观望";
      return `
        <article class="history-item">
          <div class="history-row-top">
            <strong>${escapeHtml(alert.name)}</strong>
            <span class="decision-status ready">已触发</span>
          </div>
          <p>${escapeHtml(labelForSymbol(alert.symbol))} · ${time}</p>
          <p>${escapeHtml(alert.summary)}</p>
          <p>复盘：${escapeHtml(actionText)} · ${escapeHtml(reviewText)}</p>
          <button type="button" class="mini-button" data-alert-action="review" data-alert-id="${escapeHtml(alert.id)}">编辑复盘</button>
        </article>
      `;
    })
    .join("");
}

function openDecisionDrawer(decisionId) {
  const result = state.decisionResults.find((item) => item.decision.id === decisionId);
  if (!result) return;
  state.selectedDecisionId = decisionId;
  els.drawerTitle.textContent = result.decision.name;
  els.drawerSummary.innerHTML = `
    <article>
      <span>交易对</span>
      <strong>${escapeHtml(labelForSymbol(result.decision.symbol))}</strong>
    </article>
    <article>
      <span>进度</span>
      <strong>${result.metCount}/${result.totalCount}</strong>
    </article>
    <article>
      <span>触发模式</span>
      <strong>${result.decision.triggerMode === "all" ? "全部满足" : "必选 + 可选"}</strong>
    </article>
  `;
  els.conditionList.innerHTML = result.conditionResults
    .map((condition) => {
      const statusText = {
        met: "已满足",
        near: "接近",
        unmet: "未满足",
        insufficient_data: "数据不足",
        source_error: "异常",
      }[condition.status] || condition.status;
      return `
        <article class="condition-card">
          <div class="condition-row-top">
            <h3>${escapeHtml(condition.name)}</h3>
            <span class="condition-badge ${condition.status}">${statusText}</span>
          </div>
          <div class="condition-values">
            <div>
              <span>当前值</span>
              <strong>${formatConditionValue(condition.currentValue, condition.type)}</strong>
            </div>
            <div>
              <span>目标值</span>
              <strong>${formatConditionValue(condition.targetValue, condition.type)}</strong>
            </div>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${Math.round(condition.progress * 100)}%"></div>
          </div>
          <p>${escapeHtml(condition.message)}</p>
          <p>${escapeHtml(condition.distanceText || "等待更多数据")}</p>
        </article>
      `;
    })
    .join("");
  els.drawer.classList.remove("hidden");
  els.drawerBackdrop.classList.remove("hidden");
}

function closeDecisionDrawer() {
  state.selectedDecisionId = null;
  els.drawer.classList.add("hidden");
  els.drawerBackdrop.classList.add("hidden");
}

function formatConditionValue(value, type) {
  if (!Number.isFinite(value)) return "--";
  if (type.includes("rsi")) return formatNumber(value, 2);
  if (type.includes("change_pct")) return formatPercent(value);
  if (type.includes("volume_ratio")) return `${formatNumber(value, 2)}x`;
  return formatPrice(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openDecisionEditor(decisionId = null) {
  closeDecisionDrawer();
  const existing = state.userDecisions.find((item) => item.id === decisionId);
  state.editingDecisionId = existing?.id || null;
  els.editorTitle.textContent = existing ? "编辑决策" : "新建决策";
  els.decisionNameInput.value = existing?.name || "";
  setSymbolSelection("decision", existing?.symbol || state.symbol || "BTCUSDT");
  els.decisionTriggerInput.value = existing?.triggerMode || "all";
  els.decisionOptionalInput.value = existing?.minOptionalMet ?? 1;
  els.decisionCooldownInput.value = existing?.cooldownMinutes || 30;
  els.decisionNoteInput.value = existing?.note || "";
  renderConditionEditorList(existing?.conditions?.length ? existing.conditions : [createEmptyCondition()]);
  els.editor.classList.remove("hidden");
  els.editorBackdrop.classList.remove("hidden");
}

function closeDecisionEditor() {
  state.editingDecisionId = null;
  els.editor.classList.add("hidden");
  els.editorBackdrop.classList.add("hidden");
}

function renderConditionEditorList(conditions) {
  els.conditionEditorList.innerHTML = conditions
    .map((condition, index) => renderConditionEditorCard(condition, index))
    .join("");
}

function renderConditionEditorCard(condition, index) {
  const config = conditionTypeConfig(condition.type);
  const typeOptions = CONDITION_TYPES.map(
    (item) => `<option value="${item.value}" ${item.value === condition.type ? "selected" : ""}>${item.label}</option>`,
  ).join("");
  const timeframeOptions = TIMEFRAME_OPTIONS.map(
    (item) => `<option value="${item.value}" ${item.value === condition.timeframe ? "selected" : ""}>${item.label}</option>`,
  ).join("");

  return `
    <article class="condition-editor-card" data-condition-index="${index}">
      <div class="condition-row-top">
        <h4>条件 ${index + 1}</h4>
        <button type="button" class="mini-button" data-editor-action="remove-condition">删除</button>
      </div>
      <input type="hidden" data-field="id" value="${escapeHtml(condition.id)}" />
      <div class="condition-editor-grid">
        <label class="field large">
          <span>条件名称</span>
          <input data-field="name" value="${escapeHtml(condition.name || "")}" placeholder="${escapeHtml(config.defaultName)}" />
        </label>
        <label class="field">
          <span>指标</span>
          <select data-field="type">${typeOptions}</select>
        </label>
        <label class="field">
          <span>周期</span>
          <select data-field="timeframe">${timeframeOptions}</select>
        </label>
        ${renderConditionParamFields(condition)}
        <label class="checkbox-field">
          <input type="checkbox" data-field="required" ${condition.required ? "checked" : ""} />
          <span>必选条件</span>
        </label>
      </div>
    </article>
  `;
}

function renderConditionParamFields(condition) {
  const config = conditionTypeConfig(condition.type);
  const fields = [];
  if (config.fields.includes("value")) {
    const label = condition.type.includes("change_pct")
      ? "目标涨跌幅（%）"
      : condition.type.includes("rsi")
        ? "RSI 阈值"
        : "目标价格";
    fields.push(`
      <label class="field">
        <span>${label}</span>
        <input data-field="value" type="number" step="0.000001" value="${condition.params?.value ?? ""}" />
      </label>
    `);
  }
  if (config.fields.includes("period")) {
    fields.push(`
      <label class="field">
        <span>指标周期</span>
        <input data-field="period" type="number" min="2" value="${condition.params?.period ?? 14}" />
      </label>
    `);
  }
  if (config.fields.includes("lookback")) {
    fields.push(`
      <label class="field">
        <span>均量回看</span>
        <input data-field="lookback" type="number" min="2" value="${condition.params?.lookback ?? 20}" />
      </label>
    `);
  }
  if (config.fields.includes("ratio")) {
    fields.push(`
      <label class="field">
        <span>目标倍数</span>
        <input data-field="ratio" type="number" min="0" step="0.01" value="${condition.params?.ratio ?? 1.2}" />
      </label>
    `);
  }
  return fields.join("");
}

function collectEditorConditions() {
  return Array.from(els.conditionEditorList.querySelectorAll(".condition-editor-card")).map((card, index) => {
    const get = (field) => card.querySelector(`[data-field="${field}"]`);
    const type = get("type").value;
    const config = conditionTypeConfig(type);
    const defaults = { value: 0, period: type.includes("rsi") ? 14 : 20, lookback: 20, ratio: 1.2 };
    const readNumber = (field) => {
      const input = get(field);
      return input ? Number(input.value) : defaults[field];
    };
    const params = {};
    if (config.fields.includes("value")) params.value = readNumber("value");
    if (config.fields.includes("period")) params.period = readNumber("period");
    if (config.fields.includes("lookback")) params.lookback = readNumber("lookback");
    if (config.fields.includes("ratio")) params.ratio = readNumber("ratio");
    const fallbackName = buildConditionName(type, params);

    return {
      id: get("id").value || `cond-${Date.now()}-${index}`,
      name: get("name").value.trim() || fallbackName,
      type,
      source: "binance",
      timeframe: get("timeframe").value,
      required: get("required").checked,
      params,
    };
  });
}

function buildConditionName(type, params) {
  const config = conditionTypeConfig(type);
  if (type.includes("ma")) return `${config.defaultName}${params.period || ""}`;
  if (type.includes("rsi")) return `${config.defaultName} ${params.value ?? ""}`;
  if (type.includes("volume")) return `成交量达到均量 ${params.ratio ?? ""} 倍`;
  if (type.includes("change_pct")) return `${config.defaultName} ${params.value ?? ""}%`;
  return `${config.defaultName} ${params.value ?? ""}`;
}

function validateDecisionDraft(conditions) {
  if (!els.decisionNameInput.value.trim()) return "请填写决策名称";
  if (!conditions.length) return "至少需要添加一个条件";
  const invalid = conditions.find((condition) =>
    Object.values(condition.params).some((value) => !Number.isFinite(value)),
  );
  if (invalid) return `条件「${invalid.name}」参数不完整`;
  return "";
}

function saveDecisionFromEditor() {
  const conditions = collectEditorConditions();
  const error = validateDecisionDraft(conditions);
  if (error) {
    showToast("无法保存决策", error);
    return false;
  }

  const id = state.editingDecisionId || `custom-${Date.now()}`;
  const decision = {
    id,
    custom: true,
    name: els.decisionNameInput.value.trim(),
    symbol: els.decisionSymbolInput.value,
    enabled: true,
    triggerMode: els.decisionTriggerInput.value,
    minOptionalMet: Number(els.decisionOptionalInput.value) || 0,
    cooldownMinutes: Number(els.decisionCooldownInput.value) || 30,
    note: els.decisionNoteInput.value.trim(),
    conditions,
  };

  const existingIndex = state.userDecisions.findIndex((item) => item.id === id);
  if (existingIndex >= 0) state.userDecisions.splice(existingIndex, 1, decision);
  else state.userDecisions.unshift(decision);

  saveUserDecisions();
  persistDecisionToBackend(decision);
  closeDecisionEditor();
  showToast("决策已保存", `${decision.name} 已加入监控。`);
  loadMarket();
  resetTimer();
  return true;
}

function deleteUserDecision(decisionId) {
  const decision = state.userDecisions.find((item) => item.id === decisionId);
  if (!decision) return;
  if (!window.confirm(`确定删除「${decision.name}」吗？删除后将停止监控该决策。`)) return;
  state.userDecisions = state.userDecisions.filter((item) => item.id !== decisionId);
  delete state.notified[decisionId];
  saveUserDecisions();
  deleteDecisionFromBackend(decisionId);
  saveJson(NOTIFIED_STORAGE_KEY, state.notified);
  state.selectedDecisionId = null;
  showToast("决策已删除", `${decision.name} 已停止监控。`);
  loadMarket();
}

const REVIEW_ACTION_LABELS = {
  watch: "观望",
  long: "做多",
  short: "做空",
};

const REVIEW_RESULT_LABELS = {
  unreviewed: "未复盘",
  valid: "有效",
  false_positive: "误报",
  missed: "错过",
  too_broad: "条件过宽",
  too_strict: "条件过严",
};

function normalizeReview(review = {}) {
  return {
    action: review.action || "watch",
    entryPrice: review.entryPrice ?? "",
    stopLoss: review.stopLoss ?? "",
    takeProfit: review.takeProfit ?? "",
    result: review.result || "unreviewed",
    note: review.note || "",
    updatedAt: review.updatedAt || null,
  };
}

function openReviewEditor(alertId) {
  const alert = state.alerts.find((item) => item.id === alertId);
  if (!alert) return;
  const review = normalizeReview(alert.review);
  state.editingAlertId = alertId;
  els.reviewActionInput.value = review.action;
  els.reviewEntryInput.value = review.entryPrice;
  els.reviewStopInput.value = review.stopLoss;
  els.reviewTakeProfitInput.value = review.takeProfit;
  els.reviewResultInput.value = review.result;
  els.reviewNoteInput.value = review.note;
  els.reviewModal.classList.remove("hidden");
  els.reviewBackdrop.classList.remove("hidden");
}

function closeReviewEditor() {
  state.editingAlertId = null;
  els.reviewModal.classList.add("hidden");
  els.reviewBackdrop.classList.add("hidden");
}

function saveReviewFromEditor() {
  if (!state.editingAlertId) return;
  const reviewPatch = {
    action: els.reviewActionInput.value,
    entryPrice: els.reviewEntryInput.value,
    stopLoss: els.reviewStopInput.value,
    takeProfit: els.reviewTakeProfitInput.value,
    result: els.reviewResultInput.value,
    note: els.reviewNoteInput.value.trim(),
  };
  state.alerts = upsertAlertReview(state.alerts, state.editingAlertId, {
    ...reviewPatch,
  });
  saveJson(ALERT_STORAGE_KEY, state.alerts);
  persistAlertReviewToBackend(state.editingAlertId, reviewPatch);
  renderAlertHistory();
  closeReviewEditor();
  showToast("复盘已保存", "这条提醒的人工复盘记录已更新。");
}

function maybeCreateAlert(result) {
  const now = Date.now();
  const check = shouldCreateAlert(result, state.notified, state.activeSignals, now);
  if (!check.ok) return;

  const alert = createAlertFromResult(result, now);
  state.alerts = [alert, ...state.alerts].slice(0, 50);
  state.notified[alert.signalKey] = now;
  saveJson(ALERT_STORAGE_KEY, state.alerts);
  saveJson(NOTIFIED_STORAGE_KEY, state.notified);
  persistAlertToBackend(alert);
  renderAlertHistory();
  showToast(alert.name, `${labelForSymbol(alert.symbol)} 条件已满足，请打开详情人工确认。`);
  sendBrowserNotification(alert);
}

function showToast(title, message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  toast.append(strong, paragraph);
  els.toastStack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 7000);
}

function sendBrowserNotification(alert) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(alert.name, {
    body: `${labelForSymbol(alert.symbol)} 条件已满足，请手动确认。`,
  });
}

async function evaluateAllDecisions() {
  const results = [];
  for (const decision of state.decisions) {
    results.push(await evaluateDecision(decision));
  }
  state.decisionResults = results;
  renderDecisions();
  results.forEach(maybeCreateAlert);
  state.activeSignals = updateActiveSignals(results, state.activeSignals);

  if (state.selectedDecisionId && !els.drawer.classList.contains("hidden")) {
    openDecisionDrawer(state.selectedDecisionId);
  }
}

async function loadMarket() {
  if (state.isLoading) return;
  state.isLoading = true;
  const shouldShowLoading = !state.hasLoaded;

  try {
    setStatus("", "正在更新");
    if (shouldShowLoading) els.loading.classList.remove("hidden");
    state.contexts = new Map();
    const context = await getMarketContext(state.symbol, state.interval);
    state.candles = context.candles;
    updateSummary(context);
    drawChart(context.candles);
    await evaluateAllDecisions();
    state.hasLoaded = true;
    setStatus("live", "实时连接");
  } catch (error) {
    setStatus("error", "连接失败");
    els.loading.textContent = `无法获取行情：${error.message}`;
    console.error(error);
    renderDecisions();
    state.isLoading = false;
    els.loading.classList.add("hidden");
    return;
  }

  state.isLoading = false;
  els.loading.classList.add("hidden");
}

function resetTimer() {
  window.clearInterval(state.timer);
  state.timer = window.setInterval(loadMarket, REFRESH_MS);
}

els.symbolSelect.addEventListener("change", (event) => {
  setSymbolSelection("market", event.target.value, true);
});

els.intervalTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-interval]");
  if (!button) return;
  state.interval = button.dataset.interval;
  renderIntervalTabs();
  loadMarket();
  resetTimer();
});

els.chartTypeTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-chart-type]");
  if (!button) return;
  state.chartType = button.dataset.chartType;
  renderChartTypeTabs();
  if (state.candles.length) drawChart(state.candles);
});

els.refreshButton.addEventListener("click", () => {
  loadMarket();
  resetTimer();
});

els.themePresets.addEventListener("click", (event) => {
  const button = event.target.closest("[data-theme-preset]");
  if (!button) return;
  const preset = THEME_PRESETS[button.dataset.themePreset];
  applyTheme({ preset: button.dataset.themePreset, colors: preset.colors });
});

els.themeInputs.forEach((input) => {
  input.addEventListener("input", () => {
    const nextColors = { ...themeColors(), [input.dataset.themeColor]: input.value };
    applyTheme({ preset: "custom", colors: nextColors });
  });
});

els.resetThemeButton.addEventListener("click", () => {
  applyTheme({ preset: "binance", colors: THEME_PRESETS.binance.colors });
});

els.themeToggleButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleThemePanel();
});

els.closeThemeButton.addEventListener("click", closeThemePanel);

els.userButton.addEventListener("click", () => {
  if (state.currentUser) {
    openAccountDrawer();
    return;
  }
  openAuthModal("login");
});

els.closeAuthButton.addEventListener("click", closeAuthModal);
els.authBackdrop.addEventListener("click", closeAuthModal);

els.authTabs.forEach((tab) => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
});

els.switchAuthModeButton.addEventListener("click", () => {
  setAuthMode(state.authMode === "login" ? "register" : "login");
});

els.authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleAuthSubmit();
});

els.closeAccountButton.addEventListener("click", closeAccountDrawer);
els.accountBackdrop.addEventListener("click", closeAccountDrawer);

els.logoutButton.addEventListener("click", () => {
  clearSession();
  updateUserUi();
  closeAccountDrawer();
  showToast("已退出登录", "你的本地账户会话已结束。");
});

bindSymbolPicker("market");
bindSymbolPicker("decision");

document.addEventListener("click", (event) => {
  if (event.target.closest(".symbol-picker")) return;
  if (event.target.closest(".theme-panel") || event.target.closest("#themeToggleButton")) return;
  closeSymbolPickers();
  closeThemePanel();
});

els.newDecisionButton.addEventListener("click", () => {
  openDecisionEditor();
});

els.notifyButton.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    showToast("浏览器通知不可用", "当前浏览器不支持系统通知。");
    return;
  }
  const permission = await Notification.requestPermission();
  showToast("通知权限", permission === "granted" ? "浏览器通知已开启。" : "未开启浏览器通知，仍会保留页面提醒。");
});

els.clearAlertsButton.addEventListener("click", () => {
  state.alerts = [];
  saveJson(ALERT_STORAGE_KEY, state.alerts);
  renderAlertHistory();
});

els.alertHistory.addEventListener("click", (event) => {
  const reviewButton = event.target.closest("[data-alert-action='review']");
  if (!reviewButton) return;
  openReviewEditor(reviewButton.dataset.alertId);
});

els.closeReviewButton.addEventListener("click", closeReviewEditor);
els.cancelReviewButton.addEventListener("click", closeReviewEditor);
els.reviewBackdrop.addEventListener("click", closeReviewEditor);
els.reviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveReviewFromEditor();
});

els.decisionList.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    event.stopPropagation();
    const decisionId = actionButton.dataset.decisionId;
    if (actionButton.dataset.action === "edit") openDecisionEditor(decisionId);
    if (actionButton.dataset.action === "delete") deleteUserDecision(decisionId);
    return;
  }
  const card = event.target.closest("[data-decision-id]");
  if (card) openDecisionDrawer(card.dataset.decisionId);
});

els.closeDrawerButton.addEventListener("click", closeDecisionDrawer);
els.drawerBackdrop.addEventListener("click", closeDecisionDrawer);

els.learningCards.forEach((card) => {
  card.addEventListener("click", () => openLearningDrawer(card.dataset.learningTopic));
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openLearningDrawer(card.dataset.learningTopic);
  });
});
els.closeLearningButton.addEventListener("click", closeLearningDrawer);
els.learningBackdrop.addEventListener("click", closeLearningDrawer);

els.closeEditorButton.addEventListener("click", closeDecisionEditor);
els.cancelEditorButton.addEventListener("click", closeDecisionEditor);
els.editorBackdrop.addEventListener("click", closeDecisionEditor);

els.addConditionButton.addEventListener("click", () => {
  const conditions = collectEditorConditions();
  conditions.push(createEmptyCondition(conditions.length));
  renderConditionEditorList(conditions);
});

els.conditionEditorList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-editor-action='remove-condition']");
  if (!removeButton) return;
  const conditions = collectEditorConditions();
  const card = removeButton.closest(".condition-editor-card");
  const index = Number(card.dataset.conditionIndex);
  conditions.splice(index, 1);
  renderConditionEditorList(conditions.length ? conditions : [createEmptyCondition()]);
});

els.conditionEditorList.addEventListener("change", (event) => {
  const typeSelect = event.target.closest("[data-field='type']");
  if (!typeSelect) return;
  const conditions = collectEditorConditions();
  const card = typeSelect.closest(".condition-editor-card");
  const index = Number(card.dataset.conditionIndex);
  const type = typeSelect.value;
  const config = conditionTypeConfig(type);
  const defaults = { value: 0, period: type.includes("rsi") ? 14 : 20, lookback: 20, ratio: 1.2 };
  conditions[index] = {
    ...conditions[index],
    type,
    name: conditions[index].name || config.defaultName,
    params: Object.fromEntries(config.fields.map((field) => [field, defaults[field]])),
  };
  renderConditionEditorList(conditions);
});

els.decisionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveDecisionFromEditor();
});

window.addEventListener("resize", () => {
  if (state.candles.length) drawChart(state.candles);
});

renderThemePresets();
applyTheme(currentTheme(), false);
await initializeBackendData();
await restoreSession();
updateUserUi();
setSymbolSelection("market", state.symbol);
setSymbolSelection("decision", "BTCUSDT");
renderIntervalTabs();
renderChartTypeTabs();
renderAlertHistory();
renderDecisions();
loadMarket();
resetTimer();
