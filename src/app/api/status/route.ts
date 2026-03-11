import { NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { TaskConfig, LogEntry, ApiResponse } from "@/types";

// GET /api/status - Public status data (no auth required)
export async function GET() {
    try {
        const taskIds = await kv.getJSON<string[]>("task:list") ?? [];
        const tasks: Array<{
            id: string;
            name: string;
            url: string;
            status: string;
            lastResponseTime: number | null;
            lastStatusCode: number | null;
            lastRunTime: number | null;
            uptimePercent: number;
            recentLogs: LogEntry[];
        }> = [];

        for (const id of taskIds) {
            const task = await kv.getJSON<TaskConfig>(`task:info:${id}`);
            if (!task) continue;

            const logs = (await kv.getJSON<LogEntry[]>(`log:${id}`)) ?? [];

            // Calculate uptime from logs
            const totalLogs = logs.length;
            const successLogs = logs.filter((l) => l.success).length;
            const uptimePercent = totalLogs > 0
                ? Math.round((successLogs / totalLogs) * 1000) / 10
                : 100;

            tasks.push({
                id: task.id,
                name: task.name,
                url: task.url,
                status: task.status,
                lastResponseTime: task.lastResponseTime,
                lastStatusCode: task.lastStatusCode,
                lastRunTime: task.lastRunTime,
                uptimePercent,
                recentLogs: logs.slice(-24), // last 24 for sparkline chart
            });
        }

        // Global uptime
        const allLogs = tasks.flatMap((t) => t.recentLogs);
        const globalUp = allLogs.filter((l) => l.success).length;
        const globalTotal = allLogs.length;
        const globalUptime = globalTotal > 0
            ? Math.round((globalUp / globalTotal) * 1000) / 10
            : 100;

        return NextResponse.json({
            success: true,
            data: {
                globalUptime,
                totalTasks: tasks.length,
                tasks,
            },
        } satisfies ApiResponse);
    } catch {
        return NextResponse.json(
            { success: false, error: "获取状态数据失败" } satisfies ApiResponse,
            { status: 500 }
        );
    }
}
