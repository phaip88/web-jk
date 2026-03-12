import { NextResponse } from "next/server";
import { ApiResponse } from "@/types";
import { loadCronMeta } from "@/lib/task-store";

export async function GET() {
    try {
        const meta = await loadCronMeta();
        return NextResponse.json({ success: true, data: meta } satisfies ApiResponse);
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "获取 cron 元数据失败",
            } satisfies ApiResponse,
            { status: 500 }
        );
    }
}
