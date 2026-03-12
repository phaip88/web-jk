import { NextRequest, NextResponse } from "next/server";
import { TaskConfig, ApiResponse, CronResult } from "@/types";
import { pingUrl, pingResultToLogEntry, pingResultToCronResult } from "@/lib/pinger";
import { sendTelegramNotification } from "@/lib/telegram";
import { loadCronMeta, loadTask, loadTaskIds, loadTaskLogs, saveCronMeta, saveTask, saveTaskLogs } from "@/lib/task-store";
import { shouldRunTaskNow } from "@/lib/task-rules";

const MAX_LOG_ENTRIES = 5;

export async function GET(request: NextRequest) {
    try {
        const startedAt = Date.now();
        const now = Date.now();
        const taskIds = await loadTaskIds();
        const results: CronResult[] = [];
        const source = request.headers.get("x-cron-source") || request.headers.get("user-agent") || "unknown";

        // Collect tasks that need to run
        const tasksToRun: TaskConfig[] = [];
        for (const id of taskIds) {
            const task = await loadTask(id);
            if (!task) continue;
            if (task.status === "paused") continue;

            if (!shouldRunTaskNow(task, now)) continue;

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
                const logs = await loadTaskLogs(task.id);
                logs.push(logEntry);
                if (logs.length > MAX_LOG_ENTRIES) {
                    logs.splice(0, logs.length - MAX_LOG_ENTRIES);
                }
                await saveTaskLogs(task.id, logs);

                // Update task status
                const previousStatus = task.status;
                const newStatus = pingResult.success ? "up" : "down";

                const updatedTask: TaskConfig = {
                    ...task,
                    status: newStatus,
                    lastRunTime: now,
                    lastResponseTime: pingResult.responseTime,
                    lastStatusCode: pingResult.statusCode,
                    lastNotifiedStatus: task.lastNotifiedStatus ?? null,
                    lastNotifiedAt: task.lastNotifiedAt ?? null,
                    updatedAt: now,
                };

                // Build cron result
                const cronResult = pingResultToCronResult(task, pingResult);
                cronResult.previousStatus = previousStatus;
                cronResult.currentStatus = newStatus;
                results.push(cronResult);

                const isRecovery = previousStatus === "down" && newStatus === "up";
                const shouldNotify =
                    task.notifyRule === "always" ||
                    (task.notifyRule === "on_fail" && (newStatus === "down" || isRecovery));

                if (newStatus === "down") {
                    cronResult.transition = "failure";
                } else if (isRecovery) {
                    cronResult.transition = "recovery";
                } else {
                    cronResult.transition = "info";
                }

                if (shouldNotify) {
                    await sendTelegramNotification(cronResult).catch((err) =>
                        console.error(`[Cron] TG notification failed for ${task.name}:`, err)
                    );
                    updatedTask.lastNotifiedStatus = newStatus;
                    updatedTask.lastNotifiedAt = now;
                }

                await saveTask(updatedTask);
            }
        }

        await saveCronMeta({
            ...(await loadCronMeta()),
            lastTriggerAt: Date.now(),
            lastTriggerOk: true,
            lastTriggerSource: source,
            lastTriggerError: null,
            lastExecutedCount: results.length,
            lastDurationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            success: true,
            data: {
                executed: results.length,
                results,
            },
        } satisfies ApiResponse);
    } catch (error) {
        console.error("[Cron] Fatal error:", error);
        await saveCronMeta({
            ...(await loadCronMeta()),
            lastTriggerAt: Date.now(),
            lastTriggerOk: false,
            lastTriggerSource: request.headers.get("x-cron-source") || request.headers.get("user-agent") || "unknown",
            lastTriggerError: error instanceof Error ? error.message : "Cron execution failed",
            lastExecutedCount: 0,
            lastDurationMs: 0,
        }).catch(() => undefined);
        return NextResponse.json(
            {
                success: false,
                error: "Cron execution failed",
            } satisfies ApiResponse,
            { status: 500 }
        );
    }
}
