# 开发过程记录

本文档用于在不同电脑和 Codex 环境之间交接项目。当前项目是一个个人交易提醒系统，目标是先做提醒、决策辅助和复盘，不做自动交易。

## 1. 项目目标

系统面向个人交易员，核心流程是：

1. 查看 Binance 行情和专业 K 线。
2. 创建自己的交易决策。
3. 从价格、成交量、MA、RSI 等指标中选择条件。
4. 多个条件同时满足后触发提醒。
5. 用户人工判断是否下单。
6. 对每条提醒做复盘记录。

当前边界：

- 不接入真实交易所 API Key。
- 不自动下单。
- 本地账号仅用于 MVP 演示和开发。
- SQLite 用于本机开发数据，不作为正式生产数据库。

## 2. 当前架构

```text
frontend/  前端页面、样式、交互、API 客户端
backend/   Node 原生后端、账号接口、策略接口、提醒接口、SQLite 访问
shared/    前后端可复用业务逻辑
tests/     Node 基础测试
data/      本地 SQLite 数据，不提交 Git
```

关键模块：

- `shared/indicators.js`：MA、RSI、成交量倍数。
- `shared/condition-engine.js`：单个条件计算。
- `shared/decision-engine.js`：策略整体触发判断。
- `shared/alerts.js`：提醒创建、冷却、去重。
- `shared/backtest.js`：最小回测入口。
- `shared/data-source-binance.js`：Binance REST K 线。
- `shared/data-source-registry.js`：数据源抽象层。
- `backend/db.js`：SQLite 表结构和读写。
- `frontend/app.js`：当前主要 UI 渲染和事件绑定。

## 3. 已完成阶段

### 阶段一：单页行情看板

- 原生 HTML/CSS/JavaScript 单页应用。
- Binance K 线数据。
- 交易对选择和周期切换。
- 策略列表、提醒历史和浏览器通知。

### 阶段二：专业 K 线升级

- 接入 TradingView Lightweight Charts。
- 支持蜡烛图、折线图、面积图切换。
- 支持 MA20、MA60、RSI14。
- 支持策略触发 marker 和价格条件参考线。
- 鼠标悬浮显示 OHLC 信息。

### 阶段三：策略编辑和学习面板

- 支持新建自定义策略。
- 支持选择交易对、条件类型、参数、周期和触发方式。
- 支持技术指标学习面板。
- 支持主题风格和自定义配色。

### 阶段四：前后端拆分和 SQLite

- 前端移动到 `frontend/`。
- 后端移动到 `backend/`。
- 业务逻辑拆到 `shared/`。
- 使用 SQLite 保存用户、会话、策略和提醒。
- 增加 `npm run db:check` 数据库自检命令。

### 阶段五：安全边界和多用户隔离

- 后端策略、提醒、复盘接口按登录用户隔离。
- 未登录访问策略/提醒接口返回 `401`。
- 提醒记录增加 `source` 和 `timeframe`。
- 旧版本无用户归属的提醒会被视为 orphan alerts，不再通过普通用户接口返回。

### 阶段六：回测和风控基础

- 增加最小回测入口：输出触发次数、胜率占位、最大连续误报占位、平均触发间隔。
- 策略编辑器增加风控字段：计划仓位、最大亏损、止损价、止盈价、失效条件。
- 策略保存时增加 `version`，为参数版本管理打基础。

## 4. Mac 接手步骤

在 Mac 的 Codex 或终端中：

```bash
git clone <你的 GitHub 仓库地址>
cd <仓库目录>
npm install
npm test
npm run dev
```

默认访问：

```text
http://127.0.0.1:5173/
```

如果要指定端口：

```bash
PORT=5174 npm run dev
```

## 5. 数据库注意事项

SQLite 数据库文件位于：

```text
data/trading-alert-system.db
```

`data/` 不提交 Git。换到 Mac 后默认会生成一个新的本地数据库。

建议：

- 代码迁移走 GitHub。
- 本地演示数据不要直接迁移，除非确实需要历史提醒。
- 如果要迁移数据库，单独复制 `data/trading-alert-system.db`。
- 当前 Windows 机器上存在旧版本产生的 orphan alerts，建议后续做“旧提醒归档/迁移”功能，不要自动绑定到某个新用户。

## 6. 常用命令

```bash
npm run dev
npm test
npm run db:check
git status
```

## 7. 下一步开发建议

优先级建议：

1. 将最小回测入口接入 UI，支持选择策略后运行回测。
2. 增加策略绩效统计面板：触发次数、复盘结果分布、误报率、错过率。
3. 增加策略参数版本列表，支持查看历史参数版本。
4. 将 Binance REST 轮询升级为 WebSocket 实时流。
5. 扩展数据源：OKX、Funding Rate、Open Interest、链上数据、X 舆论数据。
6. 增加正式后端鉴权、生产数据库、备份和权限策略。

## 8. 当前验证记录

最近一次验证内容：

- `npm test` 通过。
- 后端语法检查通过。
- 浏览器页面可加载。
- K 线图可显示。
- 策略编辑器可显示风控字段。
- 未登录访问策略/提醒接口返回 `401`。
- 两个不同后端账号只能读取各自策略。

