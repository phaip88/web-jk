/**
 * Core Pinger Engine
 * Executes HTTP requests against monitored URLs and collects results.
 */

import { TaskConfig, LogEntry, CronResult } from "@/types";

const PING_TIMEOUT_MS = 10_000; // 10 seconds

export interface PingResult {
    statusCode: number | null;
    responseTime: number;
    success: boolean;
    errorType?: string;
    errorMessage?: string;
}

export async function pingUrl(task: TaskConfig): Promise<PingResult> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

    try {
        const response = await fetch(task.url, {
            method: task.method,
            signal: controller.signal,
            headers: {
                "User-Agent": "UptimeMonitor/1.0",
            },
            redirect: "follow",
        });

        const responseTime = Date.now() - startTime;
        clearTimeout(timer);

        const success = response.status >= 200 && response.status < 400;

        return {
            statusCode: response.status,
            responseTime,
            success,
            errorType: success ? undefined : `HTTP_${response.status}`,
            errorMessage: success ? undefined : response.statusText,
        };
    } catch (error: unknown) {
        clearTimeout(timer);
        const responseTime = Date.now() - startTime;
        const err = error as Error;

        return {
            statusCode: null,
            responseTime,
            success: false,
            errorType: err.name || "UnknownError",
            errorMessage: err.message || "Unknown error occurred",
        };
    }
}

export function pingResultToLogEntry(result: PingResult): LogEntry {
    return {
        timestamp: Date.now(),
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        success: result.success,
        errorType: result.errorType,
        errorMessage: result.errorMessage,
    };
}

export function pingResultToCronResult(
    task: TaskConfig,
    result: PingResult
): CronResult {
    return {
        taskId: task.id,
        taskName: task.name,
        url: task.url,
        success: result.success,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        errorType: result.errorType,
        errorMessage: result.errorMessage,
    };
}

/**
 * Calculate the interval in milliseconds for a given schedule string.
 */
export function scheduleToMs(schedule: string): number {
    const map: Record<string, number> = {
        "1m": 60_000,
        "5m": 300_000,
        "10m": 600_000,
        "30m": 1_800_000,
        "60m": 3_600_000,
    };
    return map[schedule] ?? 300_000; // default 5 mins
}
