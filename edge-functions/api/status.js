import { json } from "../lib/json.js";
import { loadTask, loadTaskIds, loadTaskLogs } from "../lib/store.js";
import { getKV } from "../lib/runtime.js";

export async function onRequestGet(context) {
  const kv = getKV(context);

  if (!kv) {
    return json({ success: true, data: { globalUptime: 100, totalTasks: 0, tasks: [] } });
  }

  try {
    const taskIds = await loadTaskIds(kv);
    const tasks = [];

    for (const id of taskIds) {
      const task = await loadTask(kv, id);
      if (!task) {
        continue;
      }

      const logs = await loadTaskLogs(kv, id);
      const successLogs = logs.filter((log) => log.success).length;
      const uptimePercent = logs.length > 0 ? Math.round((successLogs / logs.length) * 1000) / 10 : 100;

      tasks.push({
        id: task.id,
        name: task.name,
        url: task.url,
        status: task.status,
        lastResponseTime: task.lastResponseTime,
        lastStatusCode: task.lastStatusCode,
        lastRunTime: task.lastRunTime,
        uptimePercent,
        recentLogs: logs.slice(-5),
      });
    }

    const allLogs = tasks.flatMap((task) => task.recentLogs);
    const successCount = allLogs.filter((log) => log.success).length;
    const globalUptime = allLogs.length > 0 ? Math.round((successCount / allLogs.length) * 1000) / 10 : 100;

    return json({ success: true, data: { globalUptime, totalTasks: tasks.length, tasks } });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "获取状态数据失败" }, 500);
  }
}
