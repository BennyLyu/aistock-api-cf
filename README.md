# AIStock 持仓看板

基于 Cloudflare Workers 的 A 股数据 API + 持仓看板，前后端一体部署，访问 Worker 根路径即可查看看板。

**在线地址：** https://microice.dpdns.org/

## 功能

**持仓看板（前端）**
- 自选股实时行情（支持添加/删除，localStorage 持久化）
- 大盘指数（上证/深证/创业板）
- K 线图：分时(1/5/15分钟) + 日K/周K/月K，含 MA5/MA10/MA20/MA60 均线
- 分时模式为折线图 + 面积填充，日K及以上为蜡烛图
- 点击任意股票/指数卡片切换 K 线
- 个股详情：财务分析、公司公告、个股新闻
- 新股发行日历
- 散户集中个股（股东户数减少排行，支持排序）

**API 接口**
| 接口 | 说明 | 数据源 |
|------|------|--------|
| `/api/tencent/stock/quotes?symbols=` | 股票实时行情 | 腾讯财经 |
| `/api/tencent/index/quotes?symbols=` | 指数实时行情 | 腾讯财经 |
| `/api/tencent/kline?symbol=&period=&count=` | K 线数据 | 东方财富 |
| `/api/cn/stock/finance?symbol=` | 财务分析 | 东方财富 |
| `/api/cn/stock/announcements?symbol=` | 公司公告 | 东方财富 |
| `/api/cn/stock/news?symbol=` | 个股新闻 | 东方财富 |
| `/api/cn/ipo/list` | 新股发行日历 | 东方财富 |
| `/api/cn/gdhs/decrease` | 散户集中/股东户数 | 东方财富 |
| `/api/cn/stocks?keyword=` | A 股搜索 | D1 数据库 |
| `/api/cn/stock/infos?symbols=` | 股票基本信息 | 东方财富 |
| `/api/cn/stock/quotes/core?symbols=` | 核心行情(东方财富源) | 东方财富 |
| `/api/cn/market/stockrank` | 热门人气榜 | 东方财富 |
| `/api/news/headlines` | 新闻头条 | 财联社 |

K 线 period 参数：`1min` / `5min` / `15min` / `30min` / `60min` / `day` / `week` / `month`

## 技术栈

| 组件 | 技术 |
|------|------|
| Runtime | Cloudflare Workers |
| 语言 | TypeScript |
| 数据库 | Cloudflare D1 (SQLite) |
| 缓存 | Cloudflare Workers KV |
| 前端图表 | ECharts 5 |
| 实时行情 | 腾讯财经 (qt.gtimg.cn) |
| 数据中心 | 东方财富 (datacenter-web.eastmoney.com) |
| K 线 | 东方财富 (push2his.eastmoney.com) |

## 部署

### 前置条件
- Node.js 20+
- Cloudflare 账户

### 步骤

```bash
# 克隆
git clone https://github.com/BennyLyu/aistock-api-cf.git
cd aistock-api-cf
npm install

# 登录 Cloudflare
npx wrangler login

# 创建 D1 数据库
npx wrangler d1 create aistock-db
# 将输出的 database_id 填入 wrangler.toml

# 创建 KV 命名空间
npx wrangler kv namespace create KV
# 将输出的 id 填入 wrangler.toml

# 初始化数据库
sed '/^BEGIN;/d; /^COMMIT;/d' ./scripts/stocks.sql > /tmp/stocks_clean.sql
npx wrangler d1 execute aistock-db --remote --file=/tmp/stocks_clean.sql
npx wrangler d1 execute aistock-db --remote --file=./scripts/tags.sql
npx wrangler d1 execute aistock-db --remote --file=./scripts/stock_tags.sql
npx wrangler d1 execute aistock-db --remote --file=./scripts/news_tags.sql
npx wrangler d1 execute aistock-db --remote --file=./scripts/stock_analysis.sql
npx wrangler d1 execute aistock-db --remote --file=./scripts/scan_login.sql
npx wrangler d1 execute aistock-db --remote --file=./scripts/user_settings.sql

# 部署
npx wrangler deploy
```

### 自定义域名

在 `wrangler.toml` 中配置（域名需托管在 Cloudflare 并开启代理）：

```toml
[[routes]]
pattern = "你的域名"
custom_domain = true
```

### GitHub Actions 自动部署

推送到 `main` 分支自动部署。需在仓库 Settings → Secrets 添加：
- `CLOUDFLARE_API_TOKEN`：Cloudflare API Token（使用 "Edit Cloudflare Workers" 模板创建）
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID

## 项目结构

```
├── frontend/
│   └── index.html              # 持仓看板前端（打包进 Worker）
├── src/
│   ├── index.ts                # 入口 & 路由分发
│   ├── controllers/
│   │   ├── TencentQuoteController.ts   # 腾讯行情
│   │   ├── DataCenterController.ts     # K线/新股/散户集中度
│   │   ├── StockDetailController.ts    # 财务/公告/新闻
│   │   ├── StockQuoteController.ts     # 东方财富行情(备用)
│   │   ├── IndexQuoteController.ts     # 指数行情
│   │   ├── StockListController.ts      # A股列表
│   │   └── ...
│   ├── services/
│   │   ├── TencentQuoteService.ts      # 腾讯实时行情解析
│   │   ├── EmQuoteService.ts           # 东方财富行情
│   │   ├── CacheService.ts             # KV 缓存
│   │   └── ...
│   └── utils/
├── scripts/                    # D1 数据库初始化 SQL
├── .github/workflows/
│   └── deploy.yml              # GitHub Actions 自动部署
└── wrangler.toml               # Cloudflare Workers 配置
```

## 数据源说明

- **腾讯财经** (`qt.gtimg.cn`)：用于实时行情，从 Cloudflare Workers 境外节点可正常访问
- **东方财富 push2**：实时行情接口，从 Cloudflare Workers 境外 IP 会返回 502，已用腾讯替代
- **东方财富 push2his**：历史 K 线接口，可正常访问
- **东方财富 datacenter**：数据中心接口（新股、股东户数、财务数据等），可正常访问

## 费用

Cloudflare Workers 免费额度足够个人使用：
- Workers 请求：10 万次/天
- D1 读取：500 万行/天
- KV 读取：10 万次/天

## License

MIT
