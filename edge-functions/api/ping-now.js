import { json, parseJson } from "../lib/json.js";
import { loadTask, loadTaskLogs, saveTask, saveTaskLogs } from "../lib/store.js";
import { getKV, pingTask, sendTelegramNotification } from "../lib/runtime.js";

const MAX_LOG_ENTRIES = 5;

export async function onRequestPost(context) {
  const kv = getKV(context);

  if (!kv) {
    return json({ success: false, error: "当前部署未配置可写持久化存储，请先绑定 EdgeOne Pages KV。" }, 503);
  }

  try {
    const body = await parseJson(context.request);
    const taskId = body.id;

    if (!taskId) {
      return json({ success: false, error: "缺少任务 ID" }, 400);
    }

    const task = await loadTask(kv, taskId);
    if (!task) {
      return json({ success: false, error: "任务不存在" }, 404);
    }

    const now = Date.now();
    const ping = await pingTask(task);
    const previousStatus = task.status;
    const newStatus = ping.success ? "up" : "down";

    const logs = await loadTaskLogs(kv, task.id);
    logs.push({
      timestamp: now,
      statusCode: ping.statusCode,
      responseTime: ping.responseTime,
      success: ping.success,
      errorMessage: ping.errorMessage,
    });

    if (logs.length > MAX_LOG_ENTRIES) {
      logs.splice(0, logs.length - MAX_LOG_ENTRIES);
    }
    await saveTaskLogs(kv, task.id, logs);

    const updatedTask = {
      ...task,
      status: newStatus,
      lastRunTime: now,
      lastResponseTime: ping.responseTime,
      lastStatusCode: ping.statusCode,
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
      currentStatus: newStatus,
      transition:
        previousStatus !== "down" && newStatus === "down"
          ? "failure"
          : previousStatus === "down" && newStatus === "up"
            ? "recovery"
            : "info",
      errorMessage: ping.errorMessage,
    };

    const shouldNotify =
      task.notifyRule === "always" ||
      (task.notifyRule === "on_fail" && (newStatus === "down" || result.transition === "recovery"));

    if (shouldNotify) {
      await sendTelegramNotification(context.env, result).catch(() => undefined);
      updatedTask.lastNotifiedStatus = newStatus;
      updatedTask.lastNotifiedAt = now;
    }

    await saveTask(kv, updatedTask);

    return json({ success: true, data: { task: updatedTask, result } });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "手动拨测失败" }, 500);
  }
}
