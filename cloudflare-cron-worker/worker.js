const USER_AGENT = "Uptime-Monitor-CF-Cron-Worker/1.0";

function deriveBaseUrl(env) {
  const cronUrl = env.MONITOR_CRON_URL;
  if (!cronUrl) {
    return null;
  }

  const url = new URL(cronUrl);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function deriveApiUrl(env, path) {
  const baseUrl = deriveBaseUrl(env);
  return baseUrl ? `${baseUrl}${path}` : null;
}

function buildHeaders(env, source) {
  const headers = {
    "User-Agent": USER_AGENT,
    "x-cron-source": source,
  };

  if (env.CRON_SECRET) {
    headers.Authorization = `Bearer ${env.CRON_SECRET}`;
  }

  return headers;
}

async function triggerCron(env, source) {
  const cronUrl = env.MONITOR_CRON_URL;

  if (!cronUrl) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing MONITOR_CRON_URL binding",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  try {
    const response = await fetch(cronUrl, {
      method: "GET",
      headers: buildHeaders(env, source),
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return new Response(
      JSON.stringify(
        {
          success: response.ok,
          source,
          status: response.status,
          detail: data,
        },
        null,
        2
      ),
      {
        status: response.ok ? 200 : response.status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          success: false,
          source,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        null,
        2
      ),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}

async function fetchJson(url) {
  if (!url) {
    return { ok: false, status: 0, data: null, error: "Missing url" };
  }

  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data, error: null };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "-";
  }

  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
}

function formatAgo(timestamp) {
  if (!timestamp) {
    return "从未触发";
  }

  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) {
    return "刚刚";
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours} 小时前`;
}

function isStale(meta, env) {
  const threshold = Number(env.CRON_STALE_THRESHOLD_MS || 180000);
  return !meta?.lastTriggerAt || Date.now() - meta.lastTriggerAt > threshold;
}

function renderTaskRows(tasks) {
  if (!tasks?.length) {
    return '<tr><td colspan="5">暂无监控任务</td></tr>';
  }

  return tasks
    .map(
      (task) => `
        <tr>
          <td>${task.name}</td>
          <td>${task.status}</td>
          <td>${task.lastStatusCode ?? "无"}</td>
          <td>${task.lastResponseTime ?? "-"} ms</td>
          <td>${task.url}</td>
        </tr>`
    )
    .join("");
}

function renderPage({ cronMeta, statusData, env, fetchError }) {
  const stale = isStale(cronMeta, env);
  const tasks = statusData?.tasks || [];
  const overall = cronMeta?.lastTriggerOk && !stale ? "正常" : stale ? "超时未触发" : "触发异常";
  const overallColor = cronMeta?.lastTriggerOk && !stale ? "#22c55e" : "#ef4444";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CF Cron Worker Status</title>
  <style>
    body{font-family:Inter,Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:32px;}
    .wrap{max-width:1080px;margin:0 auto;}
    .card{background:#111827;border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:20px;margin-bottom:20px;}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;}
    .value{font-size:28px;font-weight:700;margin-top:8px;color:${overallColor};}
    table{width:100%;border-collapse:collapse;margin-top:12px;}
    th,td{text-align:left;padding:12px;border-bottom:1px solid rgba(148,163,184,.12);font-size:14px;vertical-align:top;}
    a{color:#38bdf8;text-decoration:none;}
    .muted{color:#94a3b8;}
    .actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;}
    .btn{display:inline-block;background:#2563eb;color:white;padding:10px 14px;border-radius:10px;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="muted">Cloudflare Worker Cron 状态页</div>
      <div class="value">${overall}</div>
      <div class="actions">
        <a class="btn" href="/run">立即手动触发</a>
        <a class="btn" href="/health">查看 JSON 健康检查</a>
      </div>
    </div>
    <div class="grid">
      <div class="card"><div class="muted">最近触发</div><div>${formatTime(cronMeta?.lastTriggerAt)}</div><div class="muted">${formatAgo(cronMeta?.lastTriggerAt)}</div></div>
      <div class="card"><div class="muted">最近来源</div><div>${cronMeta?.lastTriggerSource || "-"}</div></div>
      <div class="card"><div class="muted">最近执行任务数</div><div>${cronMeta?.lastExecutedCount ?? 0}</div></div>
      <div class="card"><div class="muted">最近错误</div><div>${cronMeta?.lastTriggerError || "无"}</div></div>
    </div>
    <div class="card">
      <div class="muted">目标后端</div>
      <div>${env.MONITOR_CRON_URL || "未配置 MONITOR_CRON_URL"}</div>
      ${fetchError ? `<div style="margin-top:12px;color:#fca5a5;">状态抓取异常：${fetchError}</div>` : ""}
    </div>
    <div class="card">
      <div class="muted">监控任务概览</div>
      <table>
        <thead>
          <tr><th>任务</th><th>状态</th><th>状态码</th><th>响应时间</th><th>地址</th></tr>
        </thead>
        <tbody>${renderTaskRows(tasks)}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

async function buildStatusPage(env) {
  const cronMetaUrl = deriveApiUrl(env, "/api/cron-meta");
  const statusUrl = deriveApiUrl(env, "/api/status");
  const [cronMetaRes, statusRes] = await Promise.all([fetchJson(cronMetaUrl), fetchJson(statusUrl)]);

  const cronMeta = cronMetaRes.data?.data || null;
  const statusData = statusRes.data?.data || null;
  const fetchError = cronMetaRes.error || statusRes.error || (!cronMetaRes.ok ? `cron-meta ${cronMetaRes.status}` : null) || (!statusRes.ok ? `status ${statusRes.status}` : null);

  return new Response(renderPage({ cronMeta, statusData, env, fetchError }), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return buildStatusPage(env);
    }

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify(
          {
            success: true,
            message: "Cloudflare cron worker is ready",
            hasCronUrl: Boolean(env.MONITOR_CRON_URL),
            cronMetaUrl: deriveApiUrl(env, "/api/cron-meta"),
          },
          null,
          2
        ),
        {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    if (url.pathname === "/run") {
      return triggerCron(env, "cloudflare-worker-manual");
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(triggerCron(env, "cloudflare-worker-scheduled"));
  },
};

export default worker;
