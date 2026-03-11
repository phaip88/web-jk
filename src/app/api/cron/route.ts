import { NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { TaskConfig, LogEntry, ApiResponse, CronResult } from "@/types";
import { pingUrl, pingResultToLogEntry, pingResultToCronResult, scheduleToMs } from "@/lib/pinger";
import { sendTelegramNotification } from "@/lib/telegram";

const MAX_LOG_ENTRIES = 50;

export async function GET() {
    try {
        const now = Date.now();
        const taskIds = await kv.getJSON<string[]>("task:list") ?? [];
        const results: CronResult[] = [];

        // Collect tasks that need to run
        const tasksToRun: TaskConfig[] = [];
        for (const id of taskIds) {
            const task = await kv.getJSON<TaskConfig>(`task:info:${id}`);
            if (!task) continue;
            if (task.status === "paused") continue;

            // Single-run tasks that already ran are skipped
            if (task.schedule === "single" && task.lastRunTime !== null) continue;

            // Check interval
            const interval = scheduleToMs(task.schedule);
            if (task.lastRunTime && now - task.lastRunTime < interval) continue;

            tasksToRun.push(task);
        }

        // Execute pings concurrently (batch of 10 to not overload)
        const BATCH_SIZE = 10;
        for (let i = 0; i < tasksToRun.length; i += BATCH_SIZE) {
            const batch = tasksToRun.slice(i, i + BATCH_SIZE);
            const pingResults = await Promise.allSettled(
                batch.map((task) => pingUrl(task))
            );

            for (let j = 0; j < batch.length; j++) {
                const task = batch[j];
                const settled = pingResults[j];
                const pingResult =
                    settled.status === "fulfilled"
                        ? settled.value
                        : {
                            statusCode: null as number | null,
                            responseTime: 0,
                            success: false,
                            errorType: "InternalError",
                            errorMessage: "Ping execution failed",
                        };

                // Create log entry
                const logEntry = pingResultToLogEntry(pingResult);

                // Append to logs (keep last MAX_LOG_ENTRIES)
                const logs = (await kv.getJSON<LogEntry[]>(`log:${task.id}`)) ?? [];
                logs.push(logEntry);
                if (logs.length > MAX_LOG_ENTRIES) {
                    logs.splice(0, logs.length - MAX_LOG_ENTRIES);
                }
                await kv.putJSON(`log:${task.id}`, logs);

                // Update task status
                const previousStatus = task.status;
                const newStatus = pingResult.success ? "up" : "down";

                const updatedTask: TaskConfig = {
                    ...task,
                    status: newStatus,
                    lastRunTime: now,
                    lastResponseTime: pingResult.responseTime,
                    lastStatusCode: pingResult.statusCode,
                    updatedAt: now,
                };
                await kv.putJSON(`task:info:${task.id}`, updatedTask);

                // Build cron result
                const cronResult = pingResultToCronResult(task, pingResult);
                results.push(cronResult);

                // Send notification based on rule
                const shouldNotify =
                    task.notifyRule === "always" ||
                    (task.notifyRule === "on_fail" && previousStatus !== newStatus);

                if (shouldNotify) {
                    await sendTelegramNotification(cronResult).catch((err) =>
                        console.error(`[Cron] TG notification failed for ${task.name}:`, err)
                    );
                }
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                executed: results.length,
                results,
            },
        } satisfies ApiResponse);
    } catch (error) {
        console.error("[Cron] Fatal error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Cron execution failed",
            } satisfies ApiResponse,
            { status: 500 }
        );
    }
}
