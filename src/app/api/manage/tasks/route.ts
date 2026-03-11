import { NextRequest, NextResponse } from "next/server";
import { kv, getResolvedKVStatus, KVStorageUnavailableError } from "@/lib/kv";
import { TaskConfig, TaskCreateInput, ApiResponse } from "@/types";
import { randomUUID } from "crypto";
import { normalizeMonitorUrl } from "@/lib/url";

// GET /api/manage/tasks - List all tasks
export async function GET() {
    try {
        const taskIds = await kv.getJSON<string[]>("task:list") ?? [];
        const tasks: TaskConfig[] = [];

        for (const id of taskIds) {
            const task = await kv.getJSON<TaskConfig>(`task:info:${id}`);
            if (task) tasks.push(task);
        }

        return NextResponse.json({
            success: true,
            data: {
                tasks,
                storage: await getResolvedKVStatus(),
            },
        } satisfies ApiResponse);
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "获取任务列表失败",
            } satisfies ApiResponse,
            { status: 500 }
        );
    }
}

// POST /api/manage/tasks - Create a new task
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as TaskCreateInput;

        if (!body.name || !body.url) {
            return NextResponse.json(
                { success: false, error: "任务名称和 URL 不能为空" } satisfies ApiResponse,
                { status: 400 }
            );
        }

        let normalizedUrl = "";

        try {
            normalizedUrl = normalizeMonitorUrl(body.url);
        } catch (error) {
            return NextResponse.json(
                {
                    success: false,
                    error: error instanceof Error ? error.message : "无效的 URL 格式",
                } satisfies ApiResponse,
                { status: 400 }
            );
        }

        const id = randomUUID().slice(0, 8);
        const now = Date.now();

        const task: TaskConfig = {
            id,
            name: body.name,
            url: normalizedUrl,
            method: body.method || "GET",
            schedule: body.schedule || "5m",
            notifyRule: body.notifyRule || "on_fail",
            status: "pending",
            lastRunTime: null,
            lastResponseTime: null,
            lastStatusCode: null,
            createdAt: now,
            updatedAt: now,
        };

        // Save task config
        await kv.putJSON(`task:info:${id}`, task);

        // Add to task list
        const taskIds = await kv.getJSON<string[]>("task:list") ?? [];
        taskIds.push(id);
        await kv.putJSON("task:list", taskIds);

        // Initialize empty log
        await kv.putJSON(`log:${id}`, []);

        return NextResponse.json(
            { success: true, data: task } satisfies ApiResponse,
            { status: 201 }
        );
    } catch (error) {
        const status = error instanceof KVStorageUnavailableError ? 503 : 500;
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "创建任务失败",
            } satisfies ApiResponse,
            { status }
        );
    }
}

// DELETE /api/manage/tasks?id=xxx - Delete a task
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { success: false, error: "缺少任务 ID" } satisfies ApiResponse,
                { status: 400 }
            );
        }

        // Remove from task list
        const taskIds = await kv.getJSON<string[]>("task:list") ?? [];
        const filtered = taskIds.filter((tid) => tid !== id);
        await kv.putJSON("task:list", filtered);

        // Delete task config and logs
        await kv.delete(`task:info:${id}`);
        await kv.delete(`log:${id}`);

        return NextResponse.json({ success: true, data: { deleted: id } } satisfies ApiResponse);
    } catch (error) {
        const status = error instanceof KVStorageUnavailableError ? 503 : 500;
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "删除任务失败",
            } satisfies ApiResponse,
            { status }
        );
    }
}
