// ==================== Task Types ====================

export type TaskMethod = "GET" | "POST" | "HEAD";
export type TaskSchedule = "single" | "1m" | "5m" | "10m" | "30m" | "60m";
export type NotifyRule = "on_fail" | "always" | "never";
export type TaskStatus = "up" | "down" | "pending" | "paused";

export interface TaskConfig {
  id: string;
  name: string;
  url: string;
  method: TaskMethod;
  schedule: TaskSchedule;
  notifyRule: NotifyRule;
  status: TaskStatus;
  lastRunTime: number | null;      // epoch ms
  lastResponseTime: number | null; // ms
  lastStatusCode: number | null;
  createdAt: number;               // epoch ms
  updatedAt: number;               // epoch ms
}

export interface TaskCreateInput {
  name: string;
  url: string;
  method: TaskMethod;
  schedule: TaskSchedule;
  notifyRule: NotifyRule;
}

// ==================== Log Types ====================

export interface LogEntry {
  timestamp: number;    // epoch ms
  statusCode: number | null;
  responseTime: number; // ms
  success: boolean;
  errorType?: string;
  errorMessage?: string;
}

// ==================== API Types ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CronResult {
  taskId: string;
  taskName: string;
  success: boolean;
  statusCode: number | null;
  responseTime: number;
  errorType?: string;
  errorMessage?: string;
}

// ==================== Auth Types ====================

export interface LoginRequest {
  username: string;
  password: string;
}

export interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
}
