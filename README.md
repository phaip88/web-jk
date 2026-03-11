# 🌍 Uptime Monitor (Serverless 监控系统)

一个基于 Next.js 框架构建的轻量级 URL 存活拨测系统。本项目专为 Serverless 和边缘节点 (Edge) 运行环境设计，支持全球边缘节点拨测、Telegram 告警、精美的公开状态页与加密管理的后台任务页。

## ✨ 项目优势

1. **轻量化存储抽象**：项目内置统一 `kv` 封装层；本地开发默认回退到 `.kv-store.json`，生产环境可按目标平台接入持久化存储。
2. **Serverless 友好与预构建部署**：支持打包为独立的 standalone 构件，可以部署至腾讯云 EdgeOne Pages、Vercel 等平台，或解压运行在任何带 Node.js 的云主机/软路由中。
3. **安全易用**：内置完整的全站 JWT `Cookie` 验证中间件，不登录无法探知或更改后台任务及敏感日志。
4. **灵活定时拉活机制**：针对各大云平台服务“随时休眠”的特性，采用纯 HTTP API 形式的定时拨测触发设计（`cron_worker`），解耦运行环境与定时任务执行器。

---

## 🚀 部署步骤

### 方案 A: 本地或自建主机解压部署

借助项目提供的 **GitHub Actions**，您可以直接在仓库发布的 Release 中下载预制包在其他机器上极速启动：

1. 每次往 `main` 分支提交代码，GitHub Action 会自动构建生成，并在 GitHub 的 **Releases** 页面发布一份名为 `uptime-monitor-release.zip` 的压缩包。您可以回到仓库首页，点击右侧的 `Releases` 下载。
2. 下载此 `zip` 文件并解压缩到您的服务器目录。
3. 配置环境变量：在解压目录创建 `.env.local` 文件并填入管理账号、JWT、Telegram 等相关变量。
4. 运行 `node server.js` 即可启动服务。如果需要保活，推荐使用 `pm2 start server.js --name uptime-monitor`。

### 方案 B: 腾讯云 EdgeOne Pages 部署

1. 在 EdgeOne Pages 控制台选择 **Import Git Repository**，连接您的 GitHub 仓库 `web-jk`。
2. 框架选择 `Next.js`（若控制台已自动识别，可直接沿用默认配置）。
3. 构建命令使用 `npm run build`；安装命令使用 `npm install`。
4. 环境变量在项目的 **Variables** 中配置，至少注入下文列出的管理账号、JWT 与 Telegram 相关变量。
5. 首次部署完成后，优先验证以下接口：`/`、`/login`、`/api/status`、`/api/cron`。
6. **重要**：本项目当前的持久化层并不是“开箱即用地读取 EdgeOne Pages KV”。如需在 EdgeOne Pages 长期保存任务与日志，请先阅读后文的 **KV / 持久化存储说明**。

---

## ⚙️ 环境变量配置说明 (重要)

无论您采用上述哪种部署方案，欲使本项目正常运作，都必须正确配置环境变量（在本地运行即根目录的 `.env.local` 文件，云平台上通常在“环境配置”或“Variables”区域进行设置）：

| 变量名 | 必填 | 作用描述 | 示例值 |
|---|:---:|---|---|
| **ADMIN_USER** | **是** | 管理后台的登录账号名称。 | `admin` |
| **ADMIN_PASS** | **是** | 管理后台的登录账号密码。 | `admin123` |
| **JWT_SECRET** | **是** | 用于生成用户会话加密 Token，请在生产环境务必修改为一个长随机字符串，泄露将导致未授权者访问！ | `my-super-secret-key-2024` |
| **TG_BOT_TOKEN** | *否* | 用于向 Telegram 发送报警通知的 Bot Token，前往 @BotFather 申请。如果不配置，系统将跳过 TG 报警环节。 | `123456:ABC-DEF1234ghIkl-zyx5` |
| **TG_CHAT_ID** | *否* | 用于接收 TG 通知消息的频道或个人 ID。可向 @userinfobot 发消息获取自己的 ID。 | `78411234` |
| **KV_BRIDGE_SECRET** | *建议* | Next.js 路由与 Edge Functions KV 桥接接口之间的共享密钥。建议生产环境务必配置。 | `edge-kv-bridge-secret` |
| **KV_BRIDGE_ORIGIN** | *否* | 当运行环境无法自动推断站点域名时，显式指定 KV 桥接地址来源。通常填写站点根地址。 | `https://your-domain.example` |

### KV / 持久化存储说明（EdgeOne Pages 部署前请先阅读）

当前仓库中的 `src/lib/kv.ts` 采用的是如下策略：

1. **本地开发**：回退到项目根目录的 `.kv-store.json` 文件。
2. **EdgeOne Pages 生产环境**：由 Next.js 路由通过内部桥接接口访问 `edge-functions/internal/kv/[operation].js`，再由 Edge Functions 使用绑定变量名 `__EDGE_KV__` 直接读写 Pages KV。

这意味着：

- 当前代码**并不会读取** `KV_REST_API_URL`、`KV_REST_API_TOKEN` 这类 Upstash / Vercel KV 环境变量；README 旧版本在这里的描述与仓库当前实现不一致。
- EdgeOne Pages 官方文档当前说明：**Pages KV 目前仅支持在 Edge Functions 中调用**。
- 因此，本项目已改为 **Next.js API Route -> Edge Functions KV Bridge -> EdgeOne Pages KV** 的结构，避免在 Next.js 运行时中直接访问 KV。
- EdgeOne 控制台绑定命名空间时，请将 **Variable Name** 设置为 `__EDGE_KV__`，以匹配桥接函数的读取方式。
- 桥接接口默认地址是 `/internal/kv/*`；生产环境建议配置 `KV_BRIDGE_SECRET` 保护该内部接口。

#### EdgeOne Pages 生产部署要求

1. 在项目的 **KV Storage** 页面绑定目标命名空间。
2. 绑定时将 **Variable Name** 填写为 `__EDGE_KV__`。
3. 在环境变量中配置 `KV_BRIDGE_SECRET`，并确保 Edge Functions 与 Next.js 路由使用同一份值。
4. 如果站点运行在特殊反向代理或自定义域名推断不稳定的环境中，再额外配置 `KV_BRIDGE_ORIGIN`。

*(注：系统中的监控任务列表、拨测状态记录必须存放在“真正可持久化”的存储中；本地 `.kv-store.json` 仅适合开发调试，不适合作为 EdgeOne Pages 生产环境持久化方案。)*

---

## ⏱️ 定时业务保活与心跳部署机制 (重点说明)

Serverless/Edge 服务通常没有常驻进程，因此我们**无法通过启动一个持续运行的 `setInterval` 来轮询检查任务**。

为此，本系统采用 **「API 被动触发计时检测」** (*Cron API*) 的方案。

### 原理简述
我们在 Next.js 内暴露了一个 `/api/cron` 接口。每次该接口被使用 `GET` 请求访问时，系统都会遍历一遍全部监控任务数据：对其中满足“检测间隔时长”的任务发起真实验证 `ping`，并更新数据库的状态和记录日志。

### 如何配置定时触发？
当前仓库的实现方式是：**必须有人或某个调度器主动访问 `GET /api/cron`**，系统才会执行一轮监控检查。

#### 先说结论

- **如果保持当前 `/api/cron` 的 HTTP 触发设计不变，就必须存在一个外部触发者。**
- 这个“外部”不一定是第三方 SaaS；也可以是**腾讯云自家的 SCF 定时触发器**，它仍属于腾讯云体系内方案。
- 就 EdgeOne Pages 现有公开文档来看，**没有看到 Pages 内部原生的、可直接对 Next.js API Route 设定 Cron 的调度能力**。
- 因此，**纯靠 EdgeOne Pages 项目本身，当前没有文档依据证明可以直接定时触发 `/api/cron`**。

#### 推荐方式：使用腾讯云 SCF 定时器触发 `/api/cron`

我们推荐使用 **腾讯云云函数 SCF + Timer Trigger** 来拉起这个接口，这不是第三方平台，且官方文档明确支持定时触发器。

1. 本仓库内置了一个名为 `cron-worker.js` 的脚本。
2. 在腾讯云 SCF 中创建一个 Node.js 函数，并将 `cron-worker.js` 代码粘贴进去。
3. 在云函数中设置环境变量 `MONITOR_CRON_URL` = `https://您的部署域名/api/cron`。
4. 在 SCF 中配置一个定时触发器，例如每分钟执行一次。

这样，您的监控系统就能依赖一个非常轻量的定时器产生心跳，驱动探针执行全天候监控。

#### 安全建议

- 当前仓库中的 `/api/cron` 是可直接 `GET` 访问的接口。
- 生产部署时，建议为该接口增加一个共享密钥校验（例如请求头 `Authorization: Bearer <token>` 或查询参数签名），并在 `src/app/api/cron/route.ts` 中进行校验后再执行任务。
- `cron-worker.js` 中已经预留了添加鉴权头的位置，但仓库当前默认实现尚未真正校验该秘钥。

#### 是否能完全不借助外部访问？

分两种理解：

1. **不借助第三方服务**：可以。
   - 使用腾讯云 SCF Timer Trigger 即可，不必接入 GitHub Actions Scheduler、cron-job.org、UptimeRobot 等第三方调度器。

2. **完全只靠 EdgeOne Pages 自己完成定时调度**：目前不建议这样写进部署文档。
   - 依据当前公开文档，EdgeOne Pages 提供了 Pages Functions、Node Functions、Edge Functions 与 KV，但没有明确提供“Pages 内建定时任务 / Cron Trigger for Next.js Routes”的说明。
   - 因此在可验证信息范围内，最稳妥的结论仍然是：**需要借助一个调度器来访问 `/api/cron`，推荐使用腾讯云 SCF 的官方定时触发器。**

