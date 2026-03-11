import { json } from "../lib/json.js";
import { loadTask, loadTaskIds, loadTaskLogs, saveTask, saveTaskLogs } from "../lib/store.js";
import { getKV, pingTask, scheduleToMs, sendTelegramNotification } from "../lib/runtime.js";

const MAX_LOG_ENTRIES = 50;

export async function onRequestGet(context) {
  const kv = getKV(context);

  if (!kv) {
    return json({ success: false, error: "当前部署未配置可写持久化存储，请先绑定 EdgeOne Pages KV。" }, 503);
  }

  try {
    const now = Date.now();
    const taskIds = await loadTaskIds(kv);
    const results = [];

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
        updatedAt: now,
      };
      await saveTask(kv, updatedTask);

      const result = {
        taskId: task.id,
        taskName: task.name,
        url: task.url,
        success: ping.success,
        statusCode: ping.statusCode,
        responseTime: ping.responseTime,
        errorMessage: ping.errorMessage,
      };
      results.push(result);

      const shouldNotify = task.notifyRule === "always" || (task.notifyRule === "on_fail" && previousStatus !== nextStatus);
      if (shouldNotify) {
        await sendTelegramNotification(context.env, result).catch(() => undefined);
      }
    }

    return json({ success: true, data: { executed: results.length, results } });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Cron execution failed" }, 500);
  }
}
