import { json } from "../lib/json.js";
import { loadCronMeta } from "../lib/store.js";
import { getKV } from "../lib/runtime.js";

export async function onRequestGet(context) {
  const kv = getKV(context);

  if (!kv) {
    return json({ success: true, data: { lastTriggerAt: null, lastTriggerOk: false, lastTriggerError: "KV unavailable" } });
  }

  try {
    const meta = await loadCronMeta(kv);
    return json({ success: true, data: meta });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "获取 cron 元数据失败" }, 500);
  }
}
