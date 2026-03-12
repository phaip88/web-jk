import { json } from "../lib/json.js";
import { loadCronMeta, loadTask, loadTaskIds, loadTaskLogs, saveCronMeta, saveTask, saveTaskLogs } from "../lib/store.js";
import { getKV, pingTask, scheduleToMs, sendTelegramNotification } from "../lib/runtime.js";

const MAX_LOG_ENTRIES = 5;

export async function onRequestGet(context) {
  const kv = getKV(context);

  if (!kv) {
    return json({ success: false, error: "当前部署未配置可写持久化存储，请先绑定 EdgeOne Pages KV。" }, 503);
  }

  try {
    const startedAt = Date.now();
    const now = Date.now();
    const taskIds = await loadTaskIds(kv);
    const results = [];
    const source = context.request.headers.get("x-cron-source") || context.request.headers.get("user-agent") || "unknown";

    for (const id of taskIds) {
      const task = await loadTask(kv, id);
      if (!task || task.status === "paused") {
        continue;
      }

      if (task.schedule === "single" && task.lastRunTime !== null) {
        continue;
      }

      const interval = scheduleToMs(task.schedule);
      if (task.lastRunTime && now - task.lastRunTime < interval) {
        continue;
      }

      const ping = await pingTask(task);
      const previousStatus = task.status;
      const nextStatus = ping.success ? "up" : "down";
      const logEntry = {
        timestamp: now,
        statusCode: ping.statusCode,
        responseTime: ping.responseTime,
        success: ping.success,
        errorMessage: ping.errorMessage,
      };

      const logs = await loadTaskLogs(kv, task.id);
      logs.push(logEntry);
      if (logs.length > MAX_LOG_ENTRIES) {
        logs.splice(0, logs.length - MAX_LOG_ENTRIES);
      }
      await saveTaskLogs(kv, task.id, logs);

      const updatedTask = {
        ...task,
        status: nextStatus,
        lastRunTime: now,
        lastResponseTime: ping.responseTime,
        lastStatusCode: ping.statusCode,
        lastNotifiedStatus: task.lastNotifiedStatus ?? null,
        lastNotifiedAt: task.lastNotifiedAt ?? null,
        updatedAt: now,
      };

      const result = {
        taskId: task.id,
        taskName: task.name,
        url: task.url,
        success: ping.success,
        statusCode: ping.statusCode,
        responseTime: ping.responseTime,
        previousStatus,
        currentStatus: nextStatus,
        errorMessage: ping.errorMessage,
      };
      results.push(result);

      const isRecovery = previousStatus === "down" && nextStatus === "up";
      result.transition = nextStatus === "down" ? "failure" : isRecovery ? "recovery" : "info";

      const shouldNotify = task.notifyRule === "always" || (task.notifyRule === "on_fail" && (nextStatus === "down" || isRecovery));
      if (shouldNotify) {
        await sendTelegramNotification(context.env, result).catch(() => undefined);
        updatedTask.lastNotifiedStatus = nextStatus;
        updatedTask.lastNotifiedAt = now;
      }

      await saveTask(kv, updatedTask);
    }

    await saveCronMeta(kv, {
      ...(await loadCronMeta(kv)),
      lastTriggerAt: Date.now(),
      lastTriggerOk: true,
      lastTriggerSource: source,
      lastTriggerError: null,
      lastExecutedCount: results.length,
      lastDurationMs: Date.now() - startedAt,
    });

    return json({ success: true, data: { executed: results.length, results } });
  } catch (error) {
    await saveCronMeta(kv, {
      ...(await loadCronMeta(kv)),
      lastTriggerAt: Date.now(),
      lastTriggerOk: false,
      lastTriggerSource: context.request.headers.get("x-cron-source") || context.request.headers.get("user-agent") || "unknown",
      lastTriggerError: error instanceof Error ? error.message : "Cron execution failed",
      lastExecutedCount: 0,
      lastDurationMs: 0,
    }).catch(() => undefined);
    return json({ success: false, error: error instanceof Error ? error.message : "Cron execution failed" }, 500);
  }
}
