/**
 * Uptime Monitor - Cron Worker 触发脚本
 * 
 * 作用：
 * 本脚本用于在各类 Severless 云函数（如腾讯云云函数 SCF、阿里云函数计算 FC、AWS Lambda 等）中定时执行，
 * 通过发送 HTTP 请求触发部署在服务端的 `/api/cron` 接口，以保持监控服务对各网站的存活检测任务持续运行。
 * 
 * 使用方式：
 * 1. 在云函数控制台创建一个新函数，运行环境选择 Node.js (建议 Node.js 18+)。
 * 2. 拷贝本文件所有代码覆盖到云函数的执行文件（例如 `index.js`）中。
 * 3. 配置环境变量：在云函数配置中添加 `MONITOR_CRON_URL` 变量，其值为：
 *    您的项目地址加上触发路径，例如 `https://您的域名/api/cron`。
 * 4. 给云函数绑定一个“定时触发器”，配置为每分钟运行一次（例如 Cron 表达式: `0 * * * * * *`）。
 */

// 根据云函数供应商的不同，入口函数签名可能稍有差异，此处提供标准的 Node.js 异步函数示例
exports.main_handler = async (event, context) => {
    const cronUrl = process.env.MONITOR_CRON_URL;

    if (!cronUrl) {
        console.error("未配置环境变量 MONITOR_CRON_URL，请在云平台设置。");
        // 直接返回异常
        return {
            statusCode: 500,
            body: "Missing MONITOR_CRON_URL environment variable"
        };
    }

    console.log(`[Cron Worker] 开始触发定时任务，目标地址: ${cronUrl}`);

    try {
        // 调用应用程序的心跳/检测接口
        const response = await fetch(cronUrl, {
            method: "GET",
            headers: {
                "User-Agent": "Uptime-Monitor-Cron-Worker/1.0",
                // 如果您的 `/api/cron` 有秘钥保护机制，请在这里或 URL 携带秘钥。
                // 例如： "Authorization": `Bearer ${process.env.CRON_SECRET}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            console.log(`[Cron Worker] 触发成功，响应数据:`, JSON.stringify(data));
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, detail: data })
            };
        } else {
            console.error(`[Cron Worker] 接口返回异常状态码: ${response.status}`, data);
            return {
                statusCode: response.status,
                body: JSON.stringify({ success: false, detail: data })
            };
        }
    } catch (error) {
        console.error(`[Cron Worker] 请求过程发生错误:`, error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};
