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
  if (logs.length === 0) {
    return (
      <div className="sparkline">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="sparkline-bar"
            style={{
              height: "3px",
              background: "var(--border-color)",
            }}
          />
        ))}
      </div>
    );
  }

  const maxRT = Math.max(...logs.map((l) => l.responseTime), 1);

  return (
    <div className="sparkline">
      {logs.map((log, i) => {
        const h = Math.max(3, (log.responseTime / maxRT) * 32);
        const bg = log.success
          ? `hsl(${142 - (log.responseTime / maxRT) * 80}, 70%, 50%)`
          : "var(--danger)";

        return (
          <div
            key={i}
            className="sparkline-bar"
            style={{ height: `${h}px`, background: bg }}
            title={`${log.responseTime}ms - ${log.success ? "成功" : "失败"}`}
          />
        );
      })}
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
        <span className="uptime-ring-text">Uptime</span>
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

  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          <div className="navbar-brand">
            <span className="logo-dot" />
            Uptime Monitor
          </div>
          <div className="navbar-links">
            <a href="/login" className="btn btn-secondary btn-sm">
              登录后台
            </a>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="container">
          <h1 className="hero-title">服务状态监控</h1>
          <p className="hero-subtitle">
            实时监控所有服务的运行状态，全球边缘节点拨测
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
                  <span>📡 {task.lastStatusCode ?? "—"}</span>
                  <span>🕐 {formatTime(task.lastRunTime)}</span>
                  <span>📊 Uptime {task.uptimePercent}%</span>
                </div>
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
              <a href="/login" className="btn btn-primary btn-sm">
                前往登录
              </a>
            </div>
          )}
        </div>
      </div>

      <footer className="footer">
        <div className="container">
          Powered by <strong>Uptime Monitor</strong> · Serverless Edge Monitoring
        </div>
      </footer>
    </>
  );
}
