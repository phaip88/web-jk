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

function translateHttpStatus(code) {
  const map = {
    200: { name: "请求成功", desc: "服务器正常响应，一切正常。" },
    301: { name: "永久重定向", desc: "目标地址已永久跳转。" },
    302: { name: "临时重定向", desc: "目标地址发生了临时跳转。" },
    400: { name: "客户端请求错误", desc: "请求参数或格式不符合目标服务要求。" },
    401: { name: "未授权", desc: "目标服务需要身份验证。" },
    403: { name: "访问被拒绝", desc: "目标服务拒绝当前请求。" },
    404: { name: "资源未找到", desc: "目标地址不存在或路径错误。" },
    429: { name: "请求过多", desc: "目标服务触发了限流策略。" },
    500: { name: "服务器内部错误", desc: "目标服务内部发生异常。" },
    502: { name: "错误网关", desc: "上游服务返回了无效响应。" },
    503: { name: "服务不可用", desc: "目标服务暂时不可用或正在维护。" },
    504: { name: "网关超时", desc: "上游服务在限定时间内没有响应。" },
  };

  if (map[code]) {
    return map[code];
  }
  if (code >= 200 && code < 300) {
    return { name: `成功 (${code})`, desc: "请求已成功处理。" };
  }
  if (code >= 300 && code < 400) {
    return { name: `重定向 (${code})`, desc: "目标 URL 发生了重定向。" };
  }
  if (code >= 400 && code < 500) {
    return { name: `客户端错误 (${code})`, desc: "请求存在客户端错误。" };
  }
  return { name: `服务器错误 (${code})`, desc: "目标服务器发生了内部错误。" };
}

function translateNetworkError(errorMessage) {
  const text = String(errorMessage || "");

  if (!text) {
    return { name: "网络连接失败", desc: "未收到目标服务返回的 HTTP 状态码。" };
  }
  if (text.includes("timed out") || text.includes("timeout") || text.includes("aborted")) {
    return { name: "请求超时", desc: "目标服务在限定时间内没有返回响应。" };
  }
  if (text.includes("fetch") || text.includes("Failed") || text.includes("SSL")) {
    return { name: "网络连接失败", desc: "可能是 DNS、SSL 或服务不可达导致。" };
  }

  return { name: "未知网络错误", desc: text };
}

function buildNotificationSummary(result) {
  if (result.statusCode !== null) {
    const translated = translateHttpStatus(result.statusCode);
    return {
      title: result.transition === "recovery" ? "🟢 恢复通知" : result.success ? "✅ 运行正常" : "🔴 故障告警",
      codeLine: `状态码: ${result.statusCode}`,
      detailLine: `状态说明: ${translated.name} - ${translated.desc}`,
    };
  }

  const translated = translateNetworkError(result.errorMessage);
  return {
    title: result.transition === "recovery" ? "🟢 恢复通知" : "🔴 故障告警",
    codeLine: "状态码: 无 HTTP 状态码返回",
    detailLine: `状态说明: ${translated.name} - ${translated.desc}`,
  };
}

export async function sendTelegramNotification(env, result) {
  if (!env?.TG_BOT_TOKEN || !env?.TG_CHAT_ID) {
    return false;
  }

  const summary = buildNotificationSummary(result);
  const text = [
    summary.title,
    `任务: ${result.taskName}`,
    `地址: ${result.url}`,
    `当前状态: ${result.transition === "recovery" ? "已恢复" : result.success ? "正常" : "异常"}`,
    summary.codeLine,
    summary.detailLine,
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
