// ==================== Task Types ====================

export type TaskMethod = "GET" | "POST" | "HEAD";
export type TaskSchedule = "single" | "1m" | "5m" | "10m" | "30m" | "60m";
export type NotifyRule = "on_fail" | "always" | "never";
export type TaskStatus = "up" | "down" | "pending" | "paused";
export type SuccessRuleMode = "any_http" | "2xx_3xx" | "custom_codes";
export type IntervalUnit = "minutes" | "hours";

export interface SuccessRuleConfig {
  mode: SuccessRuleMode;
  customCodes?: number[];
}

export interface IntervalScheduleConfig {
  enabled: boolean;
  value: number;
  unit: IntervalUnit;
}

export interface FixedTimeScheduleConfig {
  enabled: boolean;
  month: number | null;
  day: number | null;
  hour: number;
  minute: number;
}

export interface ScheduleConfig {
  interval: IntervalScheduleConfig;
  fixedTime: FixedTimeScheduleConfig;
}

export interface TaskConfig {
  id: string;
  name: string;
  url: string;
  method: TaskMethod;
  schedule: TaskSchedule;
  scheduleConfig?: ScheduleConfig;
  notifyRule: NotifyRule;
  successRule?: SuccessRuleConfig;
  status: TaskStatus;
  lastRunTime: number | null;      // epoch ms
  lastResponseTime: number | null; // ms
  lastStatusCode: number | null;
  lastNotifiedStatus?: TaskStatus | null;
  lastNotifiedAt?: number | null;
  createdAt: number;               // epoch ms
  updatedAt: number;               // epoch ms
}

export interface TaskCreateInput {
  name: string;
  url: string;
  method: TaskMethod;
  schedule?: TaskSchedule;
  scheduleConfig?: ScheduleConfig;
  notifyRule: NotifyRule;
  successRule?: SuccessRuleConfig;
}

export interface TaskUpdateInput extends TaskCreateInput {
  id: string;
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
  url?: string;
  success: boolean;
  statusCode: number | null;
  responseTime: number;
  transition?: "failure" | "recovery" | "info";
  currentStatus?: TaskStatus;
  previousStatus?: TaskStatus;
  errorType?: string;
  errorMessage?: string;
}

export interface CronMeta {
  lastTriggerAt: number | null;
  lastTriggerOk: boolean;
  lastTriggerSource?: string;
  lastTriggerError?: string | null;
  lastExecutedCount?: number;
  lastDurationMs?: number;
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
