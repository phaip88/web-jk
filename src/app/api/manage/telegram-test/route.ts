import { NextResponse } from "next/server";
import { ApiResponse } from "@/types";
import { sendTelegramTestNotification } from "@/lib/telegram";

export async function POST() {
  try {
    const sent = await sendTelegramTestNotification();

    if (!sent) {
      return NextResponse.json(
        { success: false, error: "Telegram 测试通知发送失败，请检查 TG_BOT_TOKEN 与 TG_CHAT_ID 配置。" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true, data: { message: "Telegram 测试通知已发送。" } } satisfies ApiResponse
    );
  } catch (error) {
    console.error("[Telegram Test] Failed:", error);
    return NextResponse.json(
      { success: false, error: "Telegram 测试通知发送失败。" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
