import { json, parseJson } from "../../lib/json.js";
import { deleteTask, deleteTaskLogs, loadTask, loadTaskIds, saveTask, saveTaskIds, saveTaskLogs } from "../../lib/store.js";
import { getKV, normalizeMonitorUrl } from "../../lib/runtime.js";

export async function onRequest(context) {
  const { request } = context;
  const kv = getKV(context);

  if (!kv) {
    return json({ success: false, error: "当前部署未配置可写持久化存储，请先绑定 EdgeOne Pages KV。" }, 503);
  }

  try {
    if (request.method === "GET") {
      const taskIds = await loadTaskIds(kv);
      const tasks = [];

      for (const id of taskIds) {
        const task = await loadTask(kv, id);
        if (task) {
          tasks.push(task);
        }
      }

      return json({ success: true, data: { tasks, storage: { backend: "edge", writable: true } } });
    }

    if (request.method === "POST") {
      const body = await parseJson(request);

      if (!body.name || !body.url) {
        return json({ success: false, error: "任务名称和 URL 不能为空" }, 400);
      }

      const id = crypto.randomUUID().slice(0, 8);
      const now = Date.now();
      const task = {
        id,
        name: String(body.name),
        url: normalizeMonitorUrl(body.url),
        method: body.method || "GET",
        schedule: body.schedule || "5m",
        notifyRule: body.notifyRule || "on_fail",
        status: "pending",
        lastRunTime: null,
        lastResponseTime: null,
        lastStatusCode: null,
        lastNotifiedStatus: null,
        lastNotifiedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      await saveTask(kv, task);
      const taskIds = await loadTaskIds(kv);
      taskIds.push(id);
      await saveTaskIds(kv, taskIds);
      await saveTaskLogs(kv, id, []);

      return json({ success: true, data: task }, 201);
    }

    if (request.method === "DELETE") {
      const url = new URL(request.url);
      const id = url.searchParams.get("id");

      if (!id) {
        return json({ success: false, error: "缺少任务 ID" }, 400);
      }

      const taskIds = await loadTaskIds(kv);
      await saveTaskIds(kv, taskIds.filter((taskId) => taskId !== id));
      await deleteTask(kv, id);
      await deleteTaskLogs(kv, id);

      return json({ success: true, data: { deleted: id } });
    }

    return json({ success: false, error: "Method Not Allowed" }, 405);
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "任务操作失败" }, 500);
  }
}
