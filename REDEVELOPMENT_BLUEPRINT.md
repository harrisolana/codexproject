# 个人交易提醒系统重构开发蓝图

本文档用于在 Mac 上让 Codex 按更完整的前后端架构重新规划和持续开发。它不是当前 MVP 的简单说明，而是面向未来百万级用户规模的产品、架构、工程、测试和运维蓝图。

## 1. 产品定位

本系统定位为“个人交易决策提醒与复盘平台”。

核心原则：

- 只做提醒，不自动交易。
- 不保存真实交易所 API Key。
- 帮助用户建立自己的交易系统，而不是给出确定性买卖建议。
- 所有策略信号必须可解释、可复盘、可追踪版本。
- 数据来源可以持续扩展，包括交易所行情、衍生品数据、链上数据、社交舆论数据和用户自定义数据。

目标用户：

- 普通个人交易员。
- 有一定技术指标认知，但缺少系统化提醒工具的用户。
- 希望把自己的交易计划结构化、条件化、复盘化的用户。

## 2. 长期能力目标

### 2.1 行情与数据

- 多交易所现货和合约行情。
- K 线、成交量、盘口、逐笔成交。
- Funding Rate、Open Interest、多空比、爆仓数据。
- 链上数据：大额转账、活跃地址、交易所净流入流出。
- 社交数据：X 舆情、关键词热度、KOL 观点聚合。
- 新闻和宏观事件日历。

### 2.2 策略与提醒

- 用户自定义策略。
- 条件组合：全部满足、任意满足、必选 + 可选、分组条件。
- 条件类型：价格、涨跌幅、MA、EMA、RSI、MACD、布林带、成交量、资金费率、OI、链上指标、舆情指标。
- 条件进度：展示每个条件距离触发还有多少。
- 策略触发点画到图上。
- 提醒去重、冷却、升级提醒、重复确认提醒。

### 2.3 风控与复盘

- 计划仓位。
- 最大可承受亏损。
- 止损价、止盈价。
- 策略失效条件。
- 提醒后人工动作：观望、做多、做空。
- 复盘结果：有效、误报、错过、条件过宽、条件过严。
- 策略绩效：触发次数、有效率、误报率、错过率、平均触发间隔。

### 2.4 学习与策略设计

- 技术指标学习模块。
- 每个指标支持图文解释、案例、常见误区。
- 从学习卡片一键生成策略条件模板。
- 策略模板市场：抄底、突破、回调、趋势跟随、风控预警。

## 3. 推荐技术栈

### 3.1 前端

建议重新开发时使用：

- Next.js 或 React + Vite。
- TypeScript。
- Lightweight Charts 作为专业 K 线图基础。
- Zustand 或 Redux Toolkit 管理客户端状态。
- TanStack Query 管理服务端数据请求。
- Tailwind CSS 或 CSS Modules 管理样式。
- Zod 做前端表单和接口数据校验。

如果希望先轻量推进，可以用：

- Vite + React + TypeScript。

推荐前端目录：

```text
apps/web/
  src/
    app/
    pages/
    components/
    features/
      market/
      chart/
      strategy/
      alerts/
      backtest/
      learning/
      account/
    shared/
      api/
      ui/
      utils/
      types/
```

### 3.2 后端

建议使用：

- Node.js + NestJS，或 Fastify + TypeScript。
- PostgreSQL 作为主数据库。
- Prisma 或 Drizzle ORM。
- Redis 作为缓存、分布式锁、提醒去重、任务队列辅助。
- BullMQ 或 Temporal 处理后台任务。
- WebSocket Gateway 推送实时行情和提醒。

推荐后端目录：

```text
apps/api/
  src/
    modules/
      auth/
      users/
      market/
      strategies/
      conditions/
      alerts/
      reviews/
      backtests/
      risk/
      learning/
      data-sources/
    shared/
      database/
      cache/
      queue/
      logger/
      config/
```

### 3.3 数据与任务

基础组件：

- PostgreSQL：用户、策略、提醒、复盘、回测结果。
- Redis：行情缓存、提醒冷却、在线状态。
- Object Storage：导出的回测报告、截图、学习素材。
- Queue Worker：策略扫描、回测任务、通知发送。
- WebSocket 服务：实时行情和提醒推送。

### 3.4 部署

百万用户前的渐进路线：

1. 单机 Docker Compose：Web + API + PostgreSQL + Redis。
2. 单区域云部署：负载均衡 + 多 API 实例 + 托管 PostgreSQL + 托管 Redis。
3. 服务拆分：行情接入、策略计算、提醒通知、回测服务独立扩容。
4. 多区域部署：行情服务边缘化，核心用户数据主区域写入。

## 4. 面向百万用户的总体架构

```text
用户浏览器
  |
  | HTTPS / WebSocket
  v
Web 前端 CDN
  |
  v
API Gateway
  |
  +-- Auth Service
  +-- User Service
  +-- Strategy Service
  +-- Alert Service
  +-- Review Service
  +-- Backtest Service
  +-- Learning Service
  |
  v
PostgreSQL / Redis / Queue
  |
  +-- Market Data Workers
  +-- Strategy Evaluation Workers
  +-- Notification Workers
  +-- Backtest Workers
```

核心思路：

- 用户请求和后台计算分离。
- 行情数据接入和策略计算分离。
- 策略触发判断不能依赖单个浏览器页面。
- 提醒发送必须可追踪、可重试、可去重。
- 高频行情只进缓存和流式系统，用户策略和结果才落主库。

## 5. 核心领域模型

### 5.1 User

```text
id
email
name
password_hash
role
created_at
updated_at
```

### 5.2 Strategy

```text
id
user_id
name
symbol
market
timeframe
trigger_mode
cooldown_minutes
enabled
version
note
created_at
updated_at
```

### 5.3 StrategyVersion

```text
id
strategy_id
version
snapshot_json
created_at
```

每次修改条件、风控、周期、参数，都生成一个版本快照。

### 5.4 Condition

```text
id
strategy_id
group_id
type
required
params_json
source
timeframe
sort_order
```

### 5.5 RiskPlan

```text
id
strategy_id
planned_position
max_loss
stop_loss
take_profit
invalidation
note
```

### 5.6 AlertSignal

```text
id
user_id
strategy_id
strategy_version
symbol
timeframe
signal_key
trigger_price
source
condition_snapshot_json
created_at
```

`signal_key` 至少包含：

- strategy_id
- strategy_version
- symbol
- timeframe
- 满足条件 ID 列表
- 条件关键参数快照

### 5.7 Review

```text
id
alert_signal_id
user_action
entry_price
stop_loss
take_profit
result
note
created_at
updated_at
```

### 5.8 BacktestRun

```text
id
user_id
strategy_id
strategy_version
symbol
timeframe
start_time
end_time
status
result_json
created_at
finished_at
```

## 6. 数据源架构

所有数据源必须实现统一接口。

```ts
interface MarketDataSource {
  id: string;
  fetchCandles(params): Promise<Candle[]>;
  subscribeCandles(params, handler): Unsubscribe;
  fetchTicker(params): Promise<Ticker>;
}
```

第一阶段：

- Binance REST K 线。
- Binance WebSocket K 线。

第二阶段：

- OKX。
- Funding Rate。
- Open Interest。

第三阶段：

- 链上数据。
- X 舆论数据。
- 新闻事件。

重要原则：

- 后端统一接入数据源，不让浏览器直接承担策略扫描。
- 浏览器可以订阅行情展示，但策略提醒应由后端 worker 计算。
- 所有数据源返回值要标准化。

## 7. 策略计算架构

### 7.1 在线提醒计算

流程：

1. 行情数据进入 Market Data Worker。
2. Worker 将标准化行情写入 Redis。
3. Strategy Evaluation Worker 按交易对和周期扫描相关策略。
4. 计算每个条件结果。
5. 生成 signal_key。
6. Redis 检查冷却和 active signal。
7. 新信号写入 PostgreSQL。
8. WebSocket 和通知服务推送给用户。

### 7.2 回测计算

流程：

1. 用户选择策略、历史区间、周期。
2. API 创建 BacktestRun。
3. Queue 投递回测任务。
4. Backtest Worker 拉取历史 K 线。
5. 按时间推进执行条件判断。
6. 输出触发次数、触发点、复盘占位、统计结果。
7. 前端展示回测报告。

### 7.3 策略版本

每次保存策略：

1. 更新 `strategies.version`。
2. 写入 `strategy_versions.snapshot_json`。
3. 后续提醒和回测都绑定具体版本。

这样可以回答：

- 这个提醒是哪个版本触发的？
- 修改参数后绩效是否变好？
- 当前误报来自哪个版本？

## 8. 前端页面规划

### 8.1 行情工作台

功能：

- 交易对搜索。
- K 线图。
- MA、RSI、MACD、布林带。
- 策略触发点 marker。
- 条件参考线。
- OHLC 悬浮面板。

### 8.2 策略中心

功能：

- 策略列表。
- 新建策略。
- 条件编辑器。
- 风控计划。
- 策略版本。
- 启用/停用。

### 8.3 决策详情

功能：

- 当前策略进度。
- 每个条件达成状态。
- 距离目标的差值。
- 近期触发记录。
- 关联 K 线图。

### 8.4 提醒与复盘

功能：

- 提醒历史。
- 用户动作记录。
- 入场价、止损、止盈。
- 复盘结果。
- 备注。

### 8.5 回测中心

功能：

- 选择策略。
- 选择历史区间。
- 运行回测。
- 展示触发点、触发次数、误报占位、平均触发间隔。
- 后续扩展真实胜率和盈亏统计。

### 8.6 学习中心

功能：

- 指标学习。
- 图文案例。
- 常见误区。
- 从课程生成策略模板。

### 8.7 系统监控

仅管理员：

- 数据源状态。
- 队列积压。
- 提醒发送量。
- API 错误率。
- WebSocket 在线数。

## 9. API 规划

### Auth

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Strategies

```text
GET    /api/strategies
POST   /api/strategies
GET    /api/strategies/:id
PATCH  /api/strategies/:id
DELETE /api/strategies/:id
GET    /api/strategies/:id/versions
```

### Alerts

```text
GET   /api/alerts
GET   /api/alerts/:id
PATCH /api/alerts/:id/review
```

### Backtests

```text
POST /api/backtests
GET  /api/backtests
GET  /api/backtests/:id
```

### Market

```text
GET /api/market/symbols
GET /api/market/candles
GET /api/market/ticker
GET /api/market/data-source-status
```

### WebSocket

```text
market:candle
strategy:progress
alert:created
backtest:updated
```

## 10. 安全设计

必须做：

- 密码使用 Argon2 或 bcrypt。
- JWT 或安全 session。
- Refresh token 轮换。
- 所有用户数据按 `user_id` 隔离。
- API 输入使用 schema 校验。
- 所有用户输入输出到页面时转义。
- 速率限制。
- 登录失败次数限制。
- 审计日志。

明确不做：

- 不保存交易所 API Key。
- 不自动交易。
- 不让策略执行真实下单动作。

## 11. 百万用户容量规划

### 11.1 读写特点

高频：

- 行情流。
- WebSocket 推送。
- 策略条件计算。

中频：

- 策略读取。
- 提醒列表。
- 复盘保存。

低频：

- 用户注册。
- 策略创建。
- 回测任务创建。

### 11.2 扩展策略

前端：

- CDN 缓存静态资源。
- 图表数据分页加载。
- 虚拟列表展示大量提醒。

API：

- 无状态 API 实例横向扩容。
- Redis 缓存常用行情和策略摘要。
- 数据库读写分离。

Worker：

- 按交易对和周期分片。
- 热门交易对独立 worker 池。
- 提醒发送独立队列。

数据库：

- PostgreSQL 分区表保存 alerts。
- alerts 按时间和 user_id 建索引。
- backtest_runs 大结果存对象存储，数据库只存摘要。

### 11.3 关键指标

必须监控：

- API p95 延迟。
- WebSocket 在线连接数。
- 行情延迟。
- 策略扫描耗时。
- 队列积压长度。
- 提醒发送成功率。
- 数据源错误率。
- 数据库慢查询。

## 12. 24 小时持续开发验证计划

目标是在 Mac 上让 Codex 能持续开发、持续验证，而不是只写代码不跑通。

### 12.1 本地开发命令

```bash
npm install
npm test
npm run dev
```

未来建议增加：

```bash
npm run lint
npm run typecheck
npm run test:watch
npm run test:e2e
npm run dev:all
```

### 12.2 自动验证层级

每次改动至少跑：

1. 单元测试：指标、条件、策略、提醒去重。
2. API 测试：认证、用户隔离、策略 CRUD、提醒复盘。
3. 浏览器测试：页面加载、图表渲染、策略创建、提醒展示。
4. 数据库测试：迁移、索引、用户隔离。

### 12.3 24 小时稳定性验证

设计一个本地 soak test：

1. 启动后端。
2. 模拟多个用户。
3. 每个用户创建多个策略。
4. 模拟行情数据流。
5. 连续运行策略计算。
6. 记录内存、错误、提醒数量、重复提醒情况。

输出报告：

```text
运行时长
模拟用户数
策略数
行情事件数
提醒数
重复提醒拦截数
错误数
平均计算耗时
最大计算耗时
内存峰值
```

### 12.4 Codex 连续开发节奏

建议每个开发循环：

1. 明确一个小目标。
2. 写或更新测试。
3. 实现功能。
4. 跑测试。
5. 浏览器验证。
6. 更新文档。
7. Git commit。

每 2 到 4 小时做一次阶段性总结：

- 完成了什么。
- 哪些测试通过。
- 新增了哪些风险。
- 下一步做什么。

## 13. Mac 上重新开发的推荐顺序

### 第 1 天：项目骨架

- 建 monorepo。
- 前端 Vite/React/TypeScript。
- 后端 Fastify/NestJS/TypeScript。
- PostgreSQL + Redis Docker Compose。
- 基础 CI 脚本。

### 第 2 天：用户和策略

- 用户注册登录。
- 策略 CRUD。
- 条件模型。
- 用户数据隔离。

### 第 3 天：行情和图表

- Binance REST。
- Binance WebSocket。
- Lightweight Charts。
- MA/RSI 副图。

### 第 4 天：提醒引擎

- 条件计算。
- 决策计算。
- signal_key。
- Redis 冷却。
- WebSocket 提醒推送。

### 第 5 天：复盘和绩效

- 提醒历史。
- 复盘记录。
- 策略统计。
- 误报率、错过率、有效率。

### 第 6 天：回测

- 回测任务。
- 历史 K 线拉取。
- 触发点计算。
- 回测报告 UI。

### 第 7 天：持续验证

- API 测试。
- 浏览器 E2E。
- soak test。
- 错误监控。
- 部署准备。

## 14. 从当前仓库迁移到新版架构

当前仓库可复用：

- 指标算法。
- 条件引擎。
- 决策引擎。
- 提醒去重思路。
- Lightweight Charts 实现经验。
- 学习面板内容结构。
- 当前 README 和开发过程记录。

建议重写：

- 前端状态管理。
- 后端 HTTP 框架。
- 数据库 schema。
- 登录鉴权。
- 实时行情。
- 后台 worker。

迁移方式：

1. 先保留当前仓库作为 MVP 参考。
2. 新建 `apps/web` 和 `apps/api`。
3. 把 `shared/` 中稳定算法迁移为 `packages/core`。
4. 新系统跑通后，再逐步替代旧页面。

## 15. 给 Mac 上 Codex 的启动提示词

可以在 Mac 的 Codex 中这样开始：

```text
请阅读 README.md、DEVELOPMENT_PROCESS.md、REDEVELOPMENT_BLUEPRINT.md。
目标是在当前项目基础上规划并逐步重构为面向百万用户的个人交易提醒系统。
请先不要重写全部代码，先提出 monorepo 目录结构、技术栈选择、数据库 schema、开发里程碑和第一阶段最小可运行任务。
系统只做提醒和复盘，不自动交易，不接入真实交易所 API Key。
每一步都要保留测试、文档和可运行状态。
```

