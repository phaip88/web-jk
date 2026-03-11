import { NextRequest, NextResponse } from "next/server";
import { createToken, validateCredentials, COOKIE_NAME } from "@/lib/auth";
import { LoginRequest, ApiResponse } from "@/types";

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as LoginRequest;

        if (!body.username || !body.password) {
            return NextResponse.json(
                { success: false, error: "请输入用户名和密码。" } satisfies ApiResponse,
                { status: 400 }
            );
        }

        if (!validateCredentials(body.username, body.password)) {
            return NextResponse.json(
                { success: false, error: "用户名或密码错误。" } satisfies ApiResponse,
                { status: 401 }
            );
        }

        const token = await createToken(body.username);

        const response = NextResponse.json(
            { success: true, data: { message: "登录成功" } } satisfies ApiResponse,
            { status: 200 }
        );

        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24, // 24h
        });

        return response;
    } catch {
        return NextResponse.json(
            { success: false, error: "服务器内部错误" } satisfies ApiResponse,
            { status: 500 }
        );
    }
}
