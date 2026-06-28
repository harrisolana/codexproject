# 个人交易提醒系统

这是一个个人交易提醒系统 MVP，用于查看 Binance 公共 K 线、创建自定义交易决策、组合多个技术条件，并在条件满足时提醒用户人工判断是否下单。

系统当前只做“提醒”和“复盘记录”，不自动交易，也不接入真实交易所 API Key。

## 如何运行

安装依赖后启动本地服务：

```bash
npm install
npm run dev
```

默认访问：

```text
http://127.0.0.1:5173/
```

如果你想继续使用当前浏览器里的 5174 端口，可以这样启动：

```bash
$env:PORT=5174; npm run dev
```

## SQL 数据库

当前使用 SQLite，数据库文件会自动创建在：

```text
data/trading-alert-system.db
```

你不需要单独安装大型数据库。只要当前 Node 版本支持 `node:sqlite`，启动 `npm run dev` 后系统会自动建表。

检查数据库是否正常：

```bash
npm run db:check
```

这个命令会显示用户、登录会话、策略、提醒记录等表的数量。

`data/` 目录不会提交到 Git，里面保存的是你的本地演示数据。

## 当前项目结构

```text
frontend/  页面、样式、前端交互和浏览器端 API 客户端
backend/   Node 后端、登录注册 API、SQLite 数据库访问
shared/    指标、条件引擎、决策引擎、提醒去重等可复用业务逻辑
tests/     Node 基础测试
data/      本地 SQLite 数据库，不提交 Git
```

## 当前已实现能力

- Binance 现货 K 线行情看板
- 交易对搜索、周期切换、实时刷新
- TradingView Lightweight Charts 专业 K 线图
- 蜡烛图、折线图、面积图切换
- MA20 / MA60 均线叠加
- RSI14 副图和 30/70 参考线
- 策略触发点 marker
- 价格阈值线和 OHLC 悬浮信息面板
- 自定义交易决策与条件编辑
- 条件引擎：价格、涨跌幅、MA、RSI、成交量倍数
- 决策引擎：全部满足、必选条件 + 可选条件
- 提醒历史和复盘记录
- 基于 signalKey 的提醒冷却与去重
- 本地后端账号注册、登录、退出
- 主题风格和自定义配色
- 技术指标学习面板

## 如何测试

```bash
npm test
```

测试覆盖：

- MA 计算
- RSI 计算
- 成交量倍数计算
- all 模式触发
- required_plus_optional 模式触发
- insufficient_data
- 提醒冷却和去重

## 重要边界

- 当前不支持自动交易。
- 当前不接入真实交易所 API Key。
- 本地账号仅用于本地演示，不是正式生产级用户系统。
- 当前 SQLite 适合 MVP 和单机开发；多人使用、云端部署时应升级后端权限、数据库备份和安全策略。

## 后续建议

- 增加正式后端鉴权、用户权限和密码策略
- 将 SQLite 升级为 PostgreSQL 或云数据库
- 使用 WebSocket 接入实时行情
- 增加回测、风控、仓位管理和策略统计
- 接入更多数据源：OKX、CoinGecko、Funding Rate、Open Interest、链上数据、X 舆论数据
- 增加策略模板、学习课程和图上条件编辑能力
