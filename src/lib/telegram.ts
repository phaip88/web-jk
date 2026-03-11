/**
 * Telegram Notification Module
 */

import { CronResult } from "@/types";
import { translateHttpStatus, translateNetworkError } from "./translator";

const TG_API = "https://api.telegram.org";

function getConfig() {
    return {
        botToken: process.env.TG_BOT_TOKEN || "",
        chatId: process.env.TG_CHAT_ID || "",
    };
}

function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

function buildMessage(result: CronResult): string {
    const statusEmoji = result.success ? "✅" : "🚨";
    const statusText = result.success ? "成功" : "失败";

    let errorSection = "";
    if (!result.success) {
        let errorName = "未知错误";
        let errorDesc = "请检查服务状态。";

        if (result.statusCode && result.statusCode >= 400) {
            const translated = translateHttpStatus(result.statusCode);
            errorName = `${result.statusCode} ${translated.name}`;
            errorDesc = translated.desc;
        } else if (result.errorType) {
            const translated = translateNetworkError(
                Object.assign(new Error(result.errorMessage || ""), {
                    name: result.errorType,
                })
            );
            errorName = translated.name;
            errorDesc = translated.desc;
        }

        errorSection = `
**错误类型**：${errorName}
**详细说明**：${errorDesc}`;
    }

    return `${statusEmoji} **URL 运行状态通知** ${statusEmoji}

**任务名称**：${result.taskName}
**监控地址**：\`${result.taskId}\`
**运行状态**：${statusEmoji} ${statusText}
**响应时间**：${result.responseTime}ms${errorSection}

⏱ **发生时间**：${formatTimestamp(Date.now())}`;
}

export async function sendTelegramNotification(result: CronResult): Promise<boolean> {
    const { botToken, chatId } = getConfig();
    if (!botToken || !chatId) {
        console.warn("[Telegram] 未配置 TG_BOT_TOKEN 或 TG_CHAT_ID，跳过通知。");
        return false;
    }

    const message = buildMessage(result);

    try {
        const response = await fetch(`${TG_API}/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
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

export { buildMessage };
