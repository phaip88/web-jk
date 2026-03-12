const TASK_LIST_KEY = "task_list";
const CRON_META_KEY = "cron_meta";

function taskInfoKey(id) {
  return `task_info_${id}`;
}

function taskLogKey(id) {
  return `task_log_${id}`;
}

async function readJson(kv, key, fallback) {
  const raw = await kv.get(key);
  if (raw === null || raw === undefined || raw === "") {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function loadTaskIds(kv) {
  return readJson(kv, TASK_LIST_KEY, []);
}

export async function saveTaskIds(kv, taskIds) {
  await kv.put(TASK_LIST_KEY, JSON.stringify(taskIds));
}

export async function loadTask(kv, id) {
  return readJson(kv, taskInfoKey(id), null);
}

export async function saveTask(kv, task) {
  await kv.put(taskInfoKey(task.id), JSON.stringify(task));
}

export async function deleteTask(kv, id) {
  await kv.delete(taskInfoKey(id));
}

export async function loadTaskLogs(kv, id) {
  return readJson(kv, taskLogKey(id), []);
}

export async function saveTaskLogs(kv, id, logs) {
  await kv.put(taskLogKey(id), JSON.stringify(logs));
}

export async function deleteTaskLogs(kv, id) {
  await kv.delete(taskLogKey(id));
}

export async function loadCronMeta(kv) {
  return readJson(kv, CRON_META_KEY, {
    lastTriggerAt: null,
    lastTriggerOk: false,
    lastTriggerError: null,
    lastExecutedCount: 0,
    lastDurationMs: 0,
  });
}

export async function saveCronMeta(kv, meta) {
  await kv.put(CRON_META_KEY, JSON.stringify(meta));
}
