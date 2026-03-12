/**
 * Telegram Notification Module
 */

import { CronResult } from "@/types";
import { translateHttpStatus, translateNetworkError } from "./translator";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const TG_API = "https://api.telegram.org";

function getConfig() {
    return {
        botToken: process.env.TG_BOT_TOKEN || "",
        chatId: process.env.TG_CHAT_ID || "",
    };
}

function formatTimestamp(ts: number): string {
    return dayjs(ts).tz("Asia/Shanghai").format("YYYY-MM-DD HH:mm:ss");
}

function buildStatusSummary(result: CronResult): { title: string; codeLine: string; detailLine: string } {
    if (result.statusCode !== null) {
        const translated = translateHttpStatus(result.statusCode);
        return {
            title:
                result.transition === "recovery"
                    ? "🟢 恢复通知"
                    : result.success
                      ? "✅ 运行正常"
                      : "🔴 故障告警",
            codeLine: `*状态码*：${result.statusCode}`,
            detailLine: `*状态说明*：${translated.name} - ${translated.desc}`,
        };
    }

    const translated = translateNetworkError(
        Object.assign(new Error(result.errorMessage || ""), {
            name: result.errorType || "TypeError",
        })
    );

    return {
        title: result.transition === "recovery" ? "🟢 恢复通知" : "🔴 故障告警",
        codeLine: "*状态码*：无 HTTP 状态码返回",
        detailLine: `*状态说明*：${translated.name} - ${translated.desc}`,
    };
}

async function sendTelegramMessage(text: string): Promise<boolean> {
    const { botToken, chatId } = getConfig();
    if (!botToken || !chatId) {
        console.warn("[Telegram] 未配置 TG_BOT_TOKEN 或 TG_CHAT_ID，跳过通知。");
        return false;
    }

    try {
        const response = await fetch(`${TG_API}/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: "Markdown",
            }),
        });

        if (!response.ok) {
            console.error(`[Telegram] 发送失败: ${response.status} ${response.statusText}`);
            return false;
        }
        return true;
    } catch (error) {
        console.error("[Telegram] 发送异常:", error);
        return false;
    }
}

function buildMessage(result: CronResult): string {
    const statusText = result.transition === "recovery"
        ? "已恢复"
        : result.success
          ? "正常"
          : "异常";
    const summary = buildStatusSummary(result);

    return `${summary.title}

*任务名称*：${result.taskName}
*监控地址*：\`${result.url || result.taskId}\`
*当前状态*：${statusText}
${summary.codeLine}
${summary.detailLine}
*响应时间*：${result.responseTime}ms
${result.errorMessage ? `*错误内容*：${result.errorMessage}
` : ""}⏱ *发生时间*：${formatTimestamp(Date.now())}`;
}

export async function sendTelegramNotification(result: CronResult): Promise<boolean> {
    const message = buildMessage(result);

    return sendTelegramMessage(message);
}

export async function sendTelegramTestNotification(): Promise<boolean> {
    const message = `🧪 *通知测试*

*任务名称*：配置自检
*监控地址*：\`manual://telegram-test\`
*当前状态*：正常
*状态码*：无 HTTP 状态码返回
*状态说明*：测试消息，不代表真实监控结果
*响应时间*：0ms

⏱ *发生时间*：${formatTimestamp(Date.now())}`;

    return sendTelegramMessage(message);
}

export { buildMessage };
