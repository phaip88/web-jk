import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

// 不需要验证的公开路径
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/cron"];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 跳过公开路径
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // 验证 JWT
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
        // API 请求返回 401
        if (pathname.startsWith("/api/")) {
            return NextResponse.json(
                { success: false, error: "未授权访问" },
                { status: 401 }
            );
        }
        // 页面请求重定向到登录页
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
    }

    const isValid = await verifyToken(token);
    if (!isValid) {
        // 清除无效的 cookie
        const response = pathname.startsWith("/api/")
            ? NextResponse.json({ success: false, error: "令牌无效或已过期" }, { status: 401 })
            : NextResponse.redirect(new URL("/login", request.url));

        response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
        return response;
    }

    return NextResponse.next();
}

export const config = {
    // 匹配除静态资源和 favicon 之外的所有请求
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
