export function getKV(context) {
  return context.env?.EDGE_KV ?? context.env?.__EDGE_KV__ ?? globalThis.EDGE_KV ?? globalThis.__EDGE_KV__ ?? null;
}

export function normalizeMonitorUrl(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("URL 不能为空");
  }

  const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = new URL(withScheme);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http 或 https 协议");
  }

  if (!parsed.hostname) {
    throw new Error("请输入有效的域名或 IP 地址");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URL 不能包含账号或密码");
  }

  return parsed.toString();
}

export function scheduleToMs(schedule) {
  const mapping = {
    single: 0,
    "1m": 60_000,
    "5m": 300_000,
    "10m": 600_000,
    "30m": 1_800_000,
    "60m": 3_600_000,
  };

  return mapping[schedule] ?? 300_000;
}

export async function sendTelegramNotification(env, result) {
  if (!env?.TG_BOT_TOKEN || !env?.TG_CHAT_ID) {
    return false;
  }

  const icon = result.success ? "✅" : "❌";
  const text = [
    `${icon} Uptime Monitor`,
    `任务: ${result.taskName}`,
    `地址: ${result.url}`,
    `状态: ${result.success ? "成功" : "失败"}`,
    `状态码: ${result.statusCode ?? "-"}`,
    `耗时: ${result.responseTime}ms`,
    result.errorMessage ? `错误: ${result.errorMessage}` : "",
  ].filter(Boolean).join("\n");

  const response = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TG_CHAT_ID,
      text,
    }),
  });

  return response.ok;
}

export async function pingTask(task) {
  const startedAt = Date.now();

  try {
    const response = await fetch(task.url, {
      method: task.method || "GET",
      redirect: "follow",
      cache: "no-store",
    });

    return {
      success: response.ok,
      statusCode: response.status,
      responseTime: Date.now() - startedAt,
      errorMessage: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      statusCode: null,
      responseTime: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "Request failed",
    };
  }
}
