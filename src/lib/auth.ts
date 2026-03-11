import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "uptime-monitor-secret-key-change-me"
);
const COOKIE_NAME = "auth_token";
const TOKEN_EXPIRY = "24h";

export async function createToken(username: string): Promise<string> {
    return new SignJWT({ sub: username })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(TOKEN_EXPIRY)
        .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<boolean> {
    try {
        await jwtVerify(token, JWT_SECRET);
        return true;
    } catch {
        return false;
    }
}

export async function getTokenFromCookies(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

export async function isAuthenticated(): Promise<boolean> {
    const token = await getTokenFromCookies();
    if (!token) return false;
    return verifyToken(token);
}

export function validateCredentials(username: string, password: string): boolean {
    const adminUser = process.env.ADMIN_USER || "admin";
    const adminPass = process.env.ADMIN_PASS || "admin123";
    return username === adminUser && password === adminPass;
}

export { COOKIE_NAME };
