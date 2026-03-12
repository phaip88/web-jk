"use client";

import { useEffect, useState, useCallback } from "react";
import { LogEntry } from "@/types";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

interface TaskStatus {
  id: string;
  name: string;
  url: string;
  status: string;
  lastResponseTime: number | null;
  lastStatusCode: number | null;
  lastRunTime: number | null;
  uptimePercent: number;
  recentLogs: LogEntry[];
}

interface StatusData {
  globalUptime: number;
  totalTasks: number;
  tasks: TaskStatus[];
}

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

function Sparkline({ logs }: { logs: LogEntry[] }) {
  const recent = logs.slice(-5);

  if (recent.length === 0) {
    return (
      <div className="sparkline">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="sparkline-bar"
            style={{
              height: "8px",
              background: "var(--border-color)",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="sparkline">
      {recent.map((log, i) => {
        const h = log.success ? 26 : 8;
        const bg = log.success ? "var(--success)" : "var(--danger)";

        return (
          <div
            key={i}
            className="sparkline-bar"
            style={{ height: `${h}px`, background: bg }}
            title={`最近拨测：${log.success ? "成功" : "失败"} / ${log.responseTime}ms`}
          />
        );
      })}
    </div>
  );
}

function SuccessRateBar({ logs }: { logs: LogEntry[] }) {
  const recent = logs.slice(-5);
  const successCount = recent.filter((log) => log.success).length;
  const percent = recent.length > 0 ? Math.round((successCount / recent.length) * 100) : 0;

  return (
    <div style={{ marginTop: 10, width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          marginBottom: 6,
        }}
      >
        <span>最近 5 次成功率</span>
        <span>{recent.length > 0 ? `${percent}%` : "暂无数据"}</span>
      </div>
      <div
        style={{
          width: "100%",
          height: 8,
          borderRadius: 999,
          background: "rgba(148, 163, 184, 0.18)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            borderRadius: 999,
            background: percent >= 80 ? "var(--success)" : percent >= 50 ? "var(--warning)" : "var(--danger)",
            transition: "width 0.2s ease",
          }}
        />
      </div>
    </div>
  );
}

function UptimeRing({ percent }: { percent: number }) {
  const r = 76;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;

  let color = "var(--success)";
  if (percent < 99) color = "var(--warning)";
  if (percent < 95) color = "var(--danger)";

  return (
    <div className="uptime-ring">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle className="uptime-ring-bg" cx="90" cy="90" r={r} />
        <circle
          className="uptime-ring-fill"
          cx="90"
          cy="90"
          r={r}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="uptime-ring-label">
        <span className="uptime-ring-value" style={{ color }}>
          {percent}%
        </span>
        <span className="uptime-ring-text">可用率</span>
      </div>
    </div>
  );
}

function formatTime(ts: number | null): string {
  if (!ts) return "—";
  return dayjs(ts).tz("Asia/Shanghai").format("MM-DD HH:mm:ss");
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [pingingId, setPingingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const json = await res.json();

      if (json.success) {
        setData(json.data);
        setLastUpdated(
          new Date().toLocaleTimeString("zh-CN", { hour12: false })
        );
      }
    } catch (err) {
      console.error("Failed to fetch status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const runManualPing = useCallback(async (taskId: string) => {
    setPingingId(taskId);
    try {
      const res = await fetch("/api/ping-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error || "手动拨测失败");
      }
      await fetchData();
    } catch {
      alert("网络错误，手动拨测失败");
    } finally {
      setPingingId(null);
    }
  }, [fetchData]);

  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          <div className="navbar-brand">
            <span className="logo-dot" />
            站点监控台
          </div>
          <div className="navbar-links">
            <a href="/admin" className="btn btn-secondary btn-sm">
              进入管理后台
            </a>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="container">
          <h1 className="hero-title">服务状态监控</h1>
          <p className="hero-subtitle">
            实时查看每个监控地址的状态、最近五次结果与手动测试入口
          </p>
        </div>
      </section>

      <div className="container">
        <div className="uptime-ring-container">
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="spinner" />
              <span style={{ color: "var(--text-muted)" }}>加载中...</span>
            </div>
          ) : (
            <UptimeRing percent={data?.globalUptime ?? 100} />
          )}
        </div>

        {data && !loading && (
          <div
            style={{
              textAlign: "center",
              marginBottom: 40,
              color: "var(--text-secondary)",
              fontSize: "0.875rem",
            }}
          >
            共 <strong>{data.totalTasks}</strong> 个监控任务 · 上次刷新 {lastUpdated}
          </div>
        )}

        <div className="task-grid" style={{ paddingBottom: 80 }}>
          {data?.tasks.map((task) => (
            <div key={task.id} className="glass-card task-card">
              <div className="task-card-info">
                <h3>{task.name}</h3>
                <div className="task-card-url">{task.url}</div>
                <div className="task-card-meta">
                  <span>
                    ⏱ {task.lastResponseTime !== null ? `${task.lastResponseTime}ms` : "—"}
                  </span>
                  <span>📡 状态码 {task.lastStatusCode ?? "无"}</span>
                  <span>🕐 {formatTime(task.lastRunTime)}</span>
                  <span>📊 可用率 {task.uptimePercent}%</span>
                </div>
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => runManualPing(task.id)}
                    disabled={pingingId === task.id}
                  >
                    {pingingId === task.id ? "拨测中..." : "立即拨测"}
                  </button>
                </div>
                <SuccessRateBar logs={task.recentLogs} />
              </div>
              <div className="task-card-right">
                <StatusBadge status={task.status} />
                <Sparkline logs={task.recentLogs} />
              </div>
            </div>
          ))}

          {!loading && data?.tasks.length === 0 && (
            <div className="glass-card empty-state">
              <div className="icon">🔍</div>
              <p>暂无监控任务</p>
              <a href="/admin" className="btn btn-primary btn-sm">
                前往管理后台
              </a>
            </div>
          )}
        </div>
      </div>

      <footer className="footer">
        <div className="container">
          由 <strong>站点监控台</strong> 提供支持 · Serverless 边缘监控
        </div>
      </footer>
    </>
  );
}
