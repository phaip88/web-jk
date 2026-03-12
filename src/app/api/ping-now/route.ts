import { NextRequest, NextResponse } from "next/server";
import { ApiResponse, CronResult, TaskConfig } from "@/types";
import { pingResultToCronResult, pingResultToLogEntry, pingUrl } from "@/lib/pinger";
import { loadTask, loadTaskLogs, saveTask, saveTaskLogs } from "@/lib/task-store";
import { sendTelegramNotification } from "@/lib/telegram";

const MAX_LOG_ENTRIES = 5;

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as { id?: string };
        const taskId = body.id;

        if (!taskId) {
            return NextResponse.json(
                { success: false, error: "缺少任务 ID" } satisfies ApiResponse,
                { status: 400 }
            );
        }

        const task = await loadTask(taskId);
        if (!task) {
            return NextResponse.json(
                { success: false, error: "任务不存在" } satisfies ApiResponse,
                { status: 404 }
            );
        }

        const now = Date.now();
        const pingResult = await pingUrl(task);
        const previousStatus = task.status;
        const newStatus: TaskConfig["status"] = pingResult.success ? "up" : "down";

        const logs = await loadTaskLogs(task.id);
        logs.push(pingResultToLogEntry(pingResult));
        if (logs.length > MAX_LOG_ENTRIES) {
            logs.splice(0, logs.length - MAX_LOG_ENTRIES);
        }
        await saveTaskLogs(task.id, logs);

        const updatedTask: TaskConfig = {
            ...task,
            status: newStatus,
            lastRunTime: now,
            lastResponseTime: pingResult.responseTime,
            lastStatusCode: pingResult.statusCode,
            updatedAt: now,
        };

        const result: CronResult = {
            ...pingResultToCronResult(task, pingResult),
            previousStatus,
            currentStatus: newStatus,
            transition:
                previousStatus !== "down" && newStatus === "down"
                    ? "failure"
                    : previousStatus === "down" && newStatus === "up"
                      ? "recovery"
                      : "info",
        };

        const shouldNotify =
            task.notifyRule === "always" ||
            (task.notifyRule === "on_fail" && (newStatus === "down" || result.transition === "recovery"));

        if (shouldNotify) {
            await sendTelegramNotification(result).catch(() => undefined);
            updatedTask.lastNotifiedStatus = newStatus;
            updatedTask.lastNotifiedAt = now;
        }

        await saveTask(updatedTask);

        return NextResponse.json(
            {
                success: true,
                data: {
                    task: updatedTask,
                    result,
                },
            } satisfies ApiResponse
        );
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "手动拨测失败",
            } satisfies ApiResponse,
            { status: 500 }
        );
    }
}
