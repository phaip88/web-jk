"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();

            if (data.success) {
                const redirect = searchParams.get("redirect") || "/status";
                router.push(redirect);
            } else {
                setError(data.error || "登录失败");
            }
        } catch {
            setError("网络连接失败，请稍后重试。");
        } finally {
            setLoading(false);
        }
    }

    return (
        <form className="glass-card login-card" onSubmit={handleSubmit}>
            <h1>🔐 系统登录</h1>
            <p className="subtitle">访问站点后请先登录，再进入管理后台</p>

            <div className="form-group">
                <label className="form-label" htmlFor="login-user">
                    用户名
                </label>
                <input
                    id="login-user"
                    className="form-input"
                    type="text"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                />
            </div>

            <div className="form-group">
                <label className="form-label" htmlFor="login-pass">
                    密码
                </label>
                <input
                    id="login-pass"
                    className="form-input"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
                className="btn btn-primary"
                type="submit"
                disabled={loading}
            >
                {loading ? (
                    <>
                        <span className="spinner" /> 登录中...
                    </>
                ) : (
                    "登 录"
                )}
            </button>

            <div
                style={{
                    textAlign: "center",
                    marginTop: 20,
                    fontSize: "0.8125rem",
                }}
            >
                <a href="/status" style={{ color: "var(--text-muted)" }}>
                    ← 返回状态页
                </a>
            </div>
        </form>
    );
}

export default function LoginPage() {
    return (
        <div className="login-container">
            <Suspense fallback={
                <div className="glass-card login-card" style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
                    <span className="spinner" />
                </div>
            }>
                <LoginForm />
            </Suspense>
        </div>
    );
}
