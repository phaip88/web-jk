# 🌍 Uptime Monitor (Serverless 监控系统)

一个基于 Next.js 框架构建的轻量级 URL 存活拨测系统。本项目专为 Serverless 和边缘节点 (Edge) 运行环境设计，支持全球边缘节点拨测、Telegram 告警、精美的公开状态页与加密管理的后台任务页。

## ✨ 项目优势

1. **轻量无状态**：无绑定数据库要求，完全利用 Vercel KV（或类似 Redis/Edge Storage）进行存储。
2. **Serverless 友好与预构建部署**：支持打包为独立的 standalone 构件，非常容易部署至腾讯云 EdgeOne Pages、Vercel 等平台，或解压运行在任何带 Node.js 的云主机/软路由中。
3. **安全易用**：内置完整的全站 JWT `Cookie` 验证中间件，不登录无法探知或更改后台任务及敏感日志。
4. **灵活定时拉活机制**：针对各大云平台服务“随时休眠”的特性，采用纯 HTTP API 形式的定时拨测触发设计（`cron_worker`），解耦运行环境与定时任务执行器。

---

## 🚀 部署步骤

### 方案 A: 本地或自建主机解压部署

借助项目提供的 **GitHub Actions**，您可以直接在仓库发布的 Release 中下载预制包在其他机器上极速启动：

1. 每次往 `main` 分支提交代码，GitHub Action 会自动构建生成，并在 GitHub 的 **Releases** 页面发布一份名为 `uptime-monitor-release.zip` 的压缩包。您可以回到仓库首页，点击右侧的 `Releases` 下载。
2. 下载此 `zip` 文件并解压缩到您的服务器目录。
3. 配置环境变量：在解压目录创建 `.env.local` 文件并填入如 KV 连接字串、Telegram Bot Token 等变量。
4. 运行 `node server.js` 即可启动服务。如果需要保活，推荐使用 `pm2 start server.js --name uptime-monitor`。

### 方案 B: 腾讯云 EdgeOne Pages 或类似边缘平台部署

1. 在 EdgeOne Pages 等支持 Node.js (Next.js) 的平台新建工程，并连接您的 GitHub 仓库 `uptime-monitor`。
2. 配置构建命令为 `npm run build`。
3. 如果平台支持提取构件目录，请指定输出为 `.next`。
4. **注意**：部分静态平台若要求上传压缩文件，您可以直接将方案 A 自动打包出的 `.zip` 上传至管理后台进行发布部署。

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
| **KV_REST_API_URL** | **是** | Serverless / Edge 环境下的键值存储连接（如 Vercel KV、Upstash Redis 的 REST URL）。 | `https://your-kv-url.upstash.io` |
| **KV_REST_API_TOKEN** | **是** | 上述 KV 数据库对应的访问 Token 凭证。 | `AYZcABCDE...` |

*(注：系统中的监控任务列表、拨测状态记录均存放在对应的 KV 数据库中，请务必保证 KV 的连接信息正确注入。)*

---

## ⏱️ 定时业务保活与心跳部署机制 (重点说明)

Serverless/Edge 服务通常是没有常驻进程的，因此我们**无法通过启动一个持续运行的 `setInterval` 来轮询检查任务**。

为此，本系统采用 **「API 被动触发计时检测」** (*Cron API*) 的方案。

### 原理简述
我们在 Next.js 内暴露了一个 `/api/cron` 接口。每次该接口被使用 `GET` 请求访问时，系统都会遍历一遍全部监控任务数据：对其中满足“检测间隔时长”的任务发起真实验证 `ping`，并更新数据库的状态和记录日志。

### 如何配置定时触发？
您需要在任何支持 **“定时任务 (CRON)”** 的外部平台上拉起这个接口。

我们推荐使用**云平台提供的云函数 (Serverless Functions)** 设置一个定时器：
1. 本仓库内置了一个名为 `cron-worker.js` 的脚本。
2. 在您的云控台（如腾讯云云函数、阿里云函数计算）建立一个运行环境为 Node.js 的函数，并将 `cron-worker.js` 代码粘贴进去。
3. 在云函数中设置环境变量 `MONITOR_CRON_URL` = `https://您的部署域名/api/cron`。
4. 在云函数平台配置一个 **每分钟触发一次 (例如 0 * * * * * *)** 的定时触发器。

这样，您的监控系统就能依赖这个极为廉价（或完全免费）的云函数产生定时心跳，驱动您的探针进行全天候监控工作了！

