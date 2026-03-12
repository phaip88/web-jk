import { kv } from "@/lib/kv";
import { CronMeta, LogEntry, TaskConfig } from "@/types";

const TASK_LIST_KEY = "task_list";
const CRON_META_KEY = "cron_meta";

function legacyTaskInfoKey(id: string): string {
  return `task:info:${id}`;
}

function legacyTaskLogKey(id: string): string {
  return `log:${id}`;
}

function taskInfoKey(id: string): string {
  return `task_info_${id}`;
}

function taskLogKey(id: string): string {
  return `task_log_${id}`;
}

async function readWithLegacyFallback<T>(primaryKey: string, legacyKey: string): Promise<T | null> {
  const primary = await kv.getJSON<T>(primaryKey);
  if (primary !== null) {
    return primary;
  }

  const legacy = await kv.getJSON<T>(legacyKey).catch(() => null);
  if (legacy !== null) {
    await kv.putJSON(primaryKey, legacy);
    return legacy;
  }

  return null;
}

export async function loadTaskIds(): Promise<string[]> {
  const primary = await kv.getJSON<string[]>(TASK_LIST_KEY);
  if (primary !== null) {
    return primary;
  }

  const legacy = await kv.getJSON<string[]>("task:list").catch(() => null);
  if (legacy !== null) {
    await kv.putJSON(TASK_LIST_KEY, legacy);
    return legacy;
  }

  return [];
}

export async function saveTaskIds(taskIds: string[]): Promise<void> {
  await kv.putJSON(TASK_LIST_KEY, taskIds);
}

export async function loadTask(id: string): Promise<TaskConfig | null> {
  return readWithLegacyFallback<TaskConfig>(taskInfoKey(id), legacyTaskInfoKey(id));
}

export async function saveTask(task: TaskConfig): Promise<void> {
  await kv.putJSON(taskInfoKey(task.id), task);
}

export async function deleteTask(taskId: string): Promise<void> {
  await kv.delete(taskInfoKey(taskId));
  await kv.delete(legacyTaskInfoKey(taskId)).catch(() => undefined);
}

export async function loadTaskLogs(taskId: string): Promise<LogEntry[]> {
  return (await readWithLegacyFallback<LogEntry[]>(taskLogKey(taskId), legacyTaskLogKey(taskId))) ?? [];
}

export async function saveTaskLogs(taskId: string, logs: LogEntry[]): Promise<void> {
  await kv.putJSON(taskLogKey(taskId), logs);
}

export async function deleteTaskLogs(taskId: string): Promise<void> {
  await kv.delete(taskLogKey(taskId));
  await kv.delete(legacyTaskLogKey(taskId)).catch(() => undefined);
}

export async function loadCronMeta(): Promise<CronMeta> {
  return (await kv.getJSON<CronMeta>(CRON_META_KEY)) ?? {
    lastTriggerAt: null,
    lastTriggerOk: false,
    lastTriggerError: null,
    lastExecutedCount: 0,
    lastDurationMs: 0,
  };
}

export async function saveCronMeta(meta: CronMeta): Promise<void> {
  await kv.putJSON(CRON_META_KEY, meta);
}
