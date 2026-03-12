import { NextRequest, NextResponse } from "next/server";
import { getResolvedKVStatus, KVStorageUnavailableError } from "@/lib/kv";
import { TaskConfig, TaskCreateInput, TaskUpdateInput, ApiResponse } from "@/types";
import { randomUUID } from "crypto";
import { normalizeMonitorUrl } from "@/lib/url";
import { deleteTask, deleteTaskLogs, loadTask, loadTaskIds, saveTask, saveTaskIds, saveTaskLogs } from "@/lib/task-store";

// GET /api/manage/tasks - List all tasks
export async function GET() {
    try {
        const taskIds = await loadTaskIds();
        const tasks: TaskConfig[] = [];

        for (const id of taskIds) {
            const task = await loadTask(id);
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
            lastNotifiedStatus: null,
            lastNotifiedAt: null,
            createdAt: now,
            updatedAt: now,
        };

        // Save task config
        await saveTask(task);

        // Add to task list
        const taskIds = await loadTaskIds();
        taskIds.push(id);
        await saveTaskIds(taskIds);

        // Initialize empty log
        await saveTaskLogs(id, []);

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

export async function PUT(request: NextRequest) {
    try {
        const body = (await request.json()) as TaskUpdateInput;

        if (!body.id || !body.name || !body.url) {
            return NextResponse.json(
                { success: false, error: "任务 ID、名称和 URL 不能为空" } satisfies ApiResponse,
                { status: 400 }
            );
        }

        const existing = await loadTask(body.id);
        if (!existing) {
            return NextResponse.json(
                { success: false, error: "任务不存在" } satisfies ApiResponse,
                { status: 404 }
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

        const updated: TaskConfig = {
            ...existing,
            name: body.name,
            url: normalizedUrl,
            method: body.method || existing.method,
            schedule: body.schedule || existing.schedule,
            notifyRule: body.notifyRule || existing.notifyRule,
            updatedAt: Date.now(),
        };

        await saveTask(updated);

        return NextResponse.json({ success: true, data: updated } satisfies ApiResponse);
    } catch (error) {
        const status = error instanceof KVStorageUnavailableError ? 503 : 500;
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "更新任务失败",
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
        const taskIds = await loadTaskIds();
        const filtered = taskIds.filter((tid) => tid !== id);
        await saveTaskIds(filtered);

        // Delete task config and logs
        await deleteTask(id);
        await deleteTaskLogs(id);

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
