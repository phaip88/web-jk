"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { ScheduleConfig, SuccessRuleConfig, TaskConfig, TaskCreateInput, LogEntry } from "@/types";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { describeScheduleConfig, normalizeScheduleConfig, normalizeSuccessRule } from "@/lib/task-rules";

dayjs.extend(utc);
dayjs.extend(timezone);

// ==================== Helpers ====================

function formatTime(ts: number | null): string {
    if (!ts) return "—";
    return dayjs(ts).tz("Asia/Shanghai").format("MM-DD HH:mm:ss");
}

function successRuleLabel(rule?: SuccessRuleConfig): string {
    const normalized = normalizeSuccessRule(rule);
    if (normalized.mode === "2xx_3xx") return "仅 2xx/3xx 视为正常";
    if (normalized.mode === "custom_codes") return `自定义状态码：${(normalized.customCodes || []).join(", ")}`;
    return "有 HTTP 响应即正常";
}

// ==================== Task Form Modal ====================

function TaskFormModal({ onClose, onCreated, disabled, initialTask }: { onClose: () => void; onCreated: () => void; disabled: boolean; initialTask: TaskConfig | null; }) {
    const [form, setForm] = useState<TaskCreateInput>({
        name: initialTask?.name || "",
        url: initialTask?.url || "",
        method: initialTask?.method || "GET",
        schedule: initialTask?.schedule || "5m",
        scheduleConfig: normalizeScheduleConfig(initialTask?.scheduleConfig, initialTask?.schedule),
        notifyRule: initialTask?.notifyRule || "on_fail",
        successRule: normalizeSuccessRule(initialTask?.successRule),
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [customCodesText, setCustomCodesText] = useState((normalizeSuccessRule(initialTask?.successRule).customCodes || []).join(","));

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (disabled) {
            setError("当前部署未配置可写持久化存储，暂时无法创建任务。");
            return;
        }
        setError("");
        setLoading(true);

        try {
            const successRule = form.successRule?.mode === "custom_codes"
                ? {
                    mode: "custom_codes" as const,
                    customCodes: customCodesText.split(",").map((item) => Number(item.trim())).filter((code) => Number.isInteger(code) && code >= 100 && code <= 599),
                }
                : form.successRule;

            const payload = initialTask ? { ...form, successRule, id: initialTask.id } : { ...form, successRule };
            const res = await fetch("/api/manage/tasks", {
                method: initialTask ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                onCreated();
                onClose();
            } else {
                setError(data.error || (initialTask ? "更新失败" : "创建失败"));
            }
        } catch {
            setError("网络错误");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <form className="glass-card modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
                <h2>{initialTask ? "✏️ 编辑监控任务" : "➕ 添加监控任务"}</h2>

                <div className="form-group">
                    <label className="form-label" htmlFor="task-name">任务名称</label>
                    <input id="task-name" className="form-input" type="text" placeholder="我的网站" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="task-url">监控 URL</label>
                    <input id="task-url" className="form-input" type="text" inputMode="url" placeholder="example.com:8080/health 或 https://example.com" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
                    <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: "0.8125rem" }}>支持 http/https、裸域名、IP、端口和路径；未填写协议时默认按 http:// 处理。</div>
                    <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: "0.8125rem" }}>若目标地址使用非常规端口且前面接了 Cloudflare/CDN 代理，平台可能无法连通；优先建议使用 80、443、8080、8443 等常见端口，或改为源站直连地址。</div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label" htmlFor="task-method">请求方法</label>
                        <select id="task-method" className="form-select" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as TaskCreateInput["method"] })}>
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="HEAD">HEAD</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">循环间隔规则</label>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.875rem" }}><input type="checkbox" checked={Boolean(form.scheduleConfig?.interval.enabled)} onChange={(e) => setForm({ ...form, scheduleConfig: { ...(form.scheduleConfig as ScheduleConfig), interval: { ...(form.scheduleConfig as ScheduleConfig).interval, enabled: e.target.checked } } })} />启用</label>
                            <input className="form-input" type="number" min={1} value={form.scheduleConfig?.interval.value || 5} onChange={(e) => setForm({ ...form, scheduleConfig: { ...(form.scheduleConfig as ScheduleConfig), interval: { ...(form.scheduleConfig as ScheduleConfig).interval, value: Number(e.target.value || 1) } } })} />
                            <select className="form-select" value={form.scheduleConfig?.interval.unit || "minutes"} onChange={(e) => setForm({ ...form, scheduleConfig: { ...(form.scheduleConfig as ScheduleConfig), interval: { ...(form.scheduleConfig as ScheduleConfig).interval, unit: e.target.value as ScheduleConfig["interval"]["unit"] } } })}>
                                <option value="minutes">分钟</option>
                                <option value="hours">小时</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">指定时间规则</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
                        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.875rem" }}><input type="checkbox" checked={Boolean(form.scheduleConfig?.fixedTime.enabled)} onChange={(e) => setForm({ ...form, scheduleConfig: { ...(form.scheduleConfig as ScheduleConfig), fixedTime: { ...(form.scheduleConfig as ScheduleConfig).fixedTime, enabled: e.target.checked } } })} />启用</label>
                        <input className="form-input" type="number" min={1} max={12} placeholder="月(可空)" value={form.scheduleConfig?.fixedTime.month ?? ""} onChange={(e) => setForm({ ...form, scheduleConfig: { ...(form.scheduleConfig as ScheduleConfig), fixedTime: { ...(form.scheduleConfig as ScheduleConfig).fixedTime, month: e.target.value ? Number(e.target.value) : null } } })} />
                        <input className="form-input" type="number" min={1} max={31} placeholder="日(可空)" value={form.scheduleConfig?.fixedTime.day ?? ""} onChange={(e) => setForm({ ...form, scheduleConfig: { ...(form.scheduleConfig as ScheduleConfig), fixedTime: { ...(form.scheduleConfig as ScheduleConfig).fixedTime, day: e.target.value ? Number(e.target.value) : null } } })} />
                        <input className="form-input" type="number" min={0} max={23} placeholder="小时" value={form.scheduleConfig?.fixedTime.hour ?? 0} onChange={(e) => setForm({ ...form, scheduleConfig: { ...(form.scheduleConfig as ScheduleConfig), fixedTime: { ...(form.scheduleConfig as ScheduleConfig).fixedTime, hour: Number(e.target.value || 0) } } })} />
                        <input className="form-input" type="number" min={0} max={59} placeholder="分钟" value={form.scheduleConfig?.fixedTime.minute ?? 0} onChange={(e) => setForm({ ...form, scheduleConfig: { ...(form.scheduleConfig as ScheduleConfig), fixedTime: { ...(form.scheduleConfig as ScheduleConfig).fixedTime, minute: Number(e.target.value || 0) } } })} />
                    </div>
                    <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: "0.8125rem" }}>可只启用循环间隔、只启用指定时间，或两者同时启用；月/日留空表示不限制。</div>
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="task-notify">通知策略</label>
                    <select id="task-notify" className="form-select" value={form.notifyRule} onChange={(e) => setForm({ ...form, notifyRule: e.target.value as TaskCreateInput["notifyRule"] })}>
                        <option value="on_fail">失败时通知，恢复时也通知</option>
                        <option value="always">每次运行都通知</option>
                        <option value="never">不通知</option>
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="task-success-rule">正常判定规则</label>
                    <select id="task-success-rule" className="form-select" value={form.successRule?.mode || "any_http"} onChange={(e) => setForm({ ...form, successRule: { mode: e.target.value as SuccessRuleConfig["mode"], customCodes: form.successRule?.customCodes } })}>
                        <option value="any_http">有 HTTP 响应即正常</option>
                        <option value="2xx_3xx">仅 2xx / 3xx 视为正常</option>
                        <option value="custom_codes">自定义状态码视为正常</option>
                    </select>
                    {form.successRule?.mode === "custom_codes" && <input className="form-input" style={{ marginTop: 8 }} type="text" placeholder="例如 200,204,401" value={customCodesText} onChange={(e) => setCustomCodesText(e.target.value)} />}
                </div>

                {error && <div className="login-error">{error}</div>}

                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>取 消</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <><span className="spinner" /> {initialTask ? "保存中..." : "创建中..."}</> : initialTask ? "保 存" : "创 建"}</button>
                </div>
            </form>
        </div>
    );
}

// ==================== Latency Chart ====================

function LatencyChart({ taskId }: { taskId: string }) {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    useEffect(() => {
        fetch("/api/status")
            .then((r) => r.json())
            .then((json) => {
                if (json.success) {
                    const task = json.data.tasks.find(
                        (t: { id: string }) => t.id === taskId
                    );
                    if (task) setLogs(task.recentLogs);
                }
            })
            .catch(() => { });
    }, [taskId]);

    if (logs.length === 0) {
        return (
            <div
                style={{
                    textAlign: "center",
                    padding: "24px",
                    color: "var(--text-muted)",
                    fontSize: "0.8125rem",
                }}
            >
                暂无日志数据
            </div>
        );
    }

    const chartData = logs.map((l, i) => ({
        idx: i + 1,
        time: dayjs(l.timestamp).tz("Asia/Shanghai").format("HH:mm"),
        latency: l.responseTime,
        status: l.success ? "up" : "down",
    }));

    return (
        <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                        dataKey="time"
                        tick={{ fontSize: 11 }}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tick={{ fontSize: 11 }}
                        unit="ms"
                        width={60}
                    />
                    <Tooltip
                        contentStyle={{
                            background: "#1a1f36",
                            border: "1px solid rgba(148,163,184,0.12)",
                            borderRadius: 8,
                            fontSize: "0.8125rem",
                        }}
                        labelStyle={{ color: "#94a3b8" }}
                    />
                    <Line
                        type="monotone"
                        dataKey="latency"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: "#818cf8" }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

// ==================== Status Badge ====================

function StatusBadge({ status }: { status: string }) {
    const label: Record<string, string> = {
        up: "正常",
        down: "故障",
        pending: "待检",
        paused: "暂停",
    };
    return (
        <span className={`badge badge-${status}`}>
            <span className="badge-dot" />
            {label[status] || status}
        </span>
    );
}

// ==================== Admin Page ====================

export default function AdminPage() {
    const [tasks, setTasks] = useState<TaskConfig[]>([]);
    const [storageWarning, setStorageWarning] = useState("");
    const [storageWritable, setStorageWritable] = useState(true);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingTask, setEditingTask] = useState<TaskConfig | null>(null);
    const [expandedTask, setExpandedTask] = useState<string | null>(null);
    const [tgTestLoading, setTgTestLoading] = useState(false);
    const router = useRouter();

    const fetchTasks = useCallback(async () => {
        try {
            const res = await fetch("/api/manage/tasks");
            if (res.status === 401) {
                router.push("/login");
                return;
            }
            const data = await res.json();
            if (data.success) {
                setTasks(data.data.tasks);
                if (data.data.storage?.writable === false) {
                    setStorageWritable(false);
                    setStorageWarning("当前部署未配置可写持久化存储，新增或删除任务会失败。请先绑定平台 KV 或外部数据库。");
                } else {
                    setStorageWritable(true);
                    setStorageWarning("");
                }
            }
        } catch (err) {
            console.error("Failed to fetch tasks:", err);
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    async function handleDelete(id: string) {
        if (!confirm("确认删除该监控任务？")) return;
        try {
            await fetch(`/api/manage/tasks?id=${id}`, { method: "DELETE" });
            fetchTasks();
        } catch {
            alert("删除失败");
        }
    }

    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
    }

    async function handleTelegramTest() {
        setTgTestLoading(true);
        try {
            const res = await fetch("/api/manage/telegram-test", { method: "POST" });
            const data = await res.json();
            if (data.success) {
                alert("Telegram 测试通知已发送，请检查目标会话。");
            } else {
                alert(data.error || "Telegram 测试通知发送失败");
            }
        } catch {
            alert("网络错误");
        } finally {
            setTgTestLoading(false);
        }
    }

    // Stats
    const upCount = tasks.filter((t) => t.status === "up").length;
    const downCount = tasks.filter((t) => t.status === "down").length;

    return (
        <>
            {/* Navbar */}
            <nav className="navbar">
                <div className="container navbar-inner">
                    <div className="navbar-brand">
                        <span className="logo-dot" />
                        站点监控台
                    </div>
                    <div className="navbar-links">
                        <a href="/status" className="btn btn-secondary btn-sm">
                            状态页
                        </a>
                        <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
                            退出登录
                        </button>
                    </div>
                </div>
            </nav>

            <div className="container">
                {/* Header */}
                <div className="admin-header">
                    <h1>📊 管理后台</h1>
                    <div style={{ display: "flex", gap: 12 }}>
                        <button
                            className="btn btn-secondary"
                            onClick={handleTelegramTest}
                            disabled={tgTestLoading}
                        >
                            {tgTestLoading ? (
                                <>
                                    <span className="spinner" /> 发送中...
                                </>
                            ) : (
                                "📨 测试 TG 通知"
                            )}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                setEditingTask(null);
                                setShowModal(true);
                            }}
                            disabled={!storageWritable}
                        >
                            ➕ 添加任务
                        </button>
                    </div>
                </div>

                {storageWarning && (
                    <div
                        className="glass-card"
                        style={{
                            marginBottom: 24,
                            borderColor: "rgba(255, 184, 77, 0.45)",
                            color: "var(--warning)",
                        }}
                    >
                        {storageWarning}
                    </div>
                )}

                {/* Stats */}
                <div className="admin-stats">
                    <div className="glass-card stat-card">
                        <div className="stat-label">总监控数</div>
                        <div className="stat-value neutral">{tasks.length}</div>
                    </div>
                    <div className="glass-card stat-card">
                        <div className="stat-label">正常运行</div>
                        <div className="stat-value up">{upCount}</div>
                    </div>
                    <div className="glass-card stat-card">
                        <div className="stat-label">故障告警</div>
                        <div className="stat-value down">{downCount}</div>
                    </div>
                </div>

                {/* Task list */}
                {loading ? (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            padding: 64,
                            gap: 8,
                        }}
                    >
                        <div className="spinner" />
                        <span style={{ color: "var(--text-muted)" }}>加载中...</span>
                    </div>
                ) : tasks.length === 0 ? (
                    <div className="glass-card empty-state">
                        <div className="icon">📡</div>
                        <p>还没有任何监控任务</p>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                                setEditingTask(null);
                                setShowModal(true);
                            }}
                            disabled={!storageWritable}
                        >
                            {storageWritable ? "创建第一个任务" : "当前部署不可写"}
                        </button>
                    </div>
                ) : (
                    <div className="task-list-admin">
                        {tasks.map((task) => (
                            <div key={task.id}>
                                <div
                                    className="glass-card task-item-admin"
                                    style={{ cursor: "pointer" }}
                                    onClick={() =>
                                        setExpandedTask(
                                            expandedTask === task.id ? null : task.id
                                        )
                                    }
                                >
                                    <div>
                                        <div className="task-name">{task.name}</div>
                                        <div className="task-url">{task.url}</div>
                                    </div>
                                    <div className="task-schedule">
                                        {describeScheduleConfig(task.scheduleConfig, task.schedule)}
                                    </div>
                                    <StatusBadge status={task.status} />
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingTask(task);
                                                setShowModal(true);
                                            }}
                                        >
                                            编辑
                                        </button>
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(task.id);
                                            }}
                                        >
                                            删除
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded chart */}
                                {expandedTask === task.id && (
                                    <div
                                        className="glass-card"
                                        style={{
                                            marginTop: -1,
                                            borderTopLeftRadius: 0,
                                            borderTopRightRadius: 0,
                                            padding: "20px 24px",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                marginBottom: 16,
                                                fontSize: "0.8125rem",
                                                color: "var(--text-secondary)",
                                            }}
                                        >
                                            <span>
                                                最近响应：{" "}
                                                {task.lastResponseTime !== null
                                                    ? `${task.lastResponseTime}ms`
                                                    : "—"}
                                            </span>
                                            <span>最后运行：{formatTime(task.lastRunTime)}</span>
                                        </div>
                                        <div style={{ marginBottom: 12, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                                            正常判定：{successRuleLabel(task.successRule)}
                                        </div>
                                        <LatencyChart taskId={task.id} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <footer className="footer">
                <div className="container">
                    由 <strong>站点监控台</strong> 提供支持 · Serverless 边缘监控
                </div>
            </footer>

            {/* Task creation modal */}
            {showModal && (
                <TaskFormModal
                    onClose={() => {
                        setShowModal(false);
                        setEditingTask(null);
                    }}
                    onCreated={fetchTasks}
                    disabled={!storageWritable}
                    initialTask={editingTask}
                />
            )}
        </>
    );
}
