import {
  FixedTimeScheduleConfig,
  ScheduleConfig,
  SuccessRuleConfig,
  TaskConfig,
  TaskSchedule,
} from "@/types";

const DEFAULT_SUCCESS_RULE: SuccessRuleConfig = { mode: "any_http" };

const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  interval: {
    enabled: true,
    value: 5,
    unit: "minutes",
  },
  fixedTime: {
    enabled: false,
    month: null,
    day: null,
    hour: 0,
    minute: 0,
  },
};

export function normalizeSuccessRule(rule?: SuccessRuleConfig | null): SuccessRuleConfig {
  if (!rule) {
    return DEFAULT_SUCCESS_RULE;
  }

  if (rule.mode === "custom_codes") {
    const codes = (rule.customCodes || [])
      .map((code) => Number(code))
      .filter((code) => Number.isInteger(code) && code >= 100 && code <= 599);

    if (codes.length === 0) {
      throw new Error("自定义状态码规则至少需要一个有效状态码");
    }

    return { mode: "custom_codes", customCodes: Array.from(new Set(codes)) };
  }

  if (rule.mode === "2xx_3xx") {
    return { mode: "2xx_3xx" };
  }

  return { mode: "any_http" };
}

function legacyScheduleToConfig(schedule?: TaskSchedule): ScheduleConfig {
  if (!schedule || schedule === "5m") {
    return { ...DEFAULT_SCHEDULE_CONFIG, interval: { enabled: true, value: 5, unit: "minutes" } };
  }

  if (schedule === "single") {
    return {
      interval: { enabled: false, value: 5, unit: "minutes" },
      fixedTime: { enabled: false, month: null, day: null, hour: 0, minute: 0 },
    };
  }

  const amount = Number(schedule.replace("m", ""));
  if (!Number.isNaN(amount)) {
    if (amount === 60) {
      return {
        interval: { enabled: true, value: 1, unit: "hours" },
        fixedTime: { enabled: false, month: null, day: null, hour: 0, minute: 0 },
      };
    }

    return {
      interval: { enabled: true, value: amount, unit: "minutes" },
      fixedTime: { enabled: false, month: null, day: null, hour: 0, minute: 0 },
    };
  }

  return DEFAULT_SCHEDULE_CONFIG;
}

function normalizeFixedTimeConfig(input?: FixedTimeScheduleConfig): FixedTimeScheduleConfig {
  const month = input?.month == null || input.month === 0 ? null : Number(input.month);
  const day = input?.day == null || input.day === 0 ? null : Number(input.day);
  const hour = Number(input?.hour ?? 0);
  const minute = Number(input?.minute ?? 0);

  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
    throw new Error("指定运行月份必须在 1 到 12 之间");
  }
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) {
    throw new Error("指定运行日期必须在 1 到 31 之间");
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("指定运行小时必须在 0 到 23 之间");
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("指定运行分钟必须在 0 到 59 之间");
  }

  return {
    enabled: Boolean(input?.enabled),
    month,
    day,
    hour,
    minute,
  };
}

export function normalizeScheduleConfig(scheduleConfig?: ScheduleConfig | null, legacySchedule?: TaskSchedule): ScheduleConfig {
  if (!scheduleConfig) {
    return legacyScheduleToConfig(legacySchedule);
  }

  const intervalValue = Number(scheduleConfig.interval?.value ?? DEFAULT_SCHEDULE_CONFIG.interval.value);
  const intervalUnit = scheduleConfig.interval?.unit === "hours" ? "hours" : "minutes";

  if (!Number.isInteger(intervalValue) || intervalValue <= 0) {
    throw new Error("循环间隔必须是大于 0 的整数");
  }

  const normalized: ScheduleConfig = {
    interval: {
      enabled: Boolean(scheduleConfig.interval?.enabled),
      value: intervalValue,
      unit: intervalUnit,
    },
    fixedTime: normalizeFixedTimeConfig(scheduleConfig.fixedTime),
  };

  if (!normalized.interval.enabled && !normalized.fixedTime.enabled) {
    throw new Error("请至少启用一个时间规则");
  }

  return normalized;
}

export function getLegacyScheduleFromConfig(config: ScheduleConfig): TaskSchedule {
  if (config.interval.enabled) {
    if (config.interval.unit === "hours") {
      return "60m";
    }

    const minutes = config.interval.value;
    if ([1, 5, 10, 30, 60].includes(minutes)) {
      return `${minutes}m` as TaskSchedule;
    }

    return "5m";
  }

  return "single";
}

function getShanghaiParts(timestamp: number) {
  const shifted = new Date(timestamp + 8 * 60 * 60 * 1000);
  return {
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function shouldTreatStatusCodeAsSuccess(statusCode: number | null, successRule?: SuccessRuleConfig | null): boolean {
  if (statusCode === null) {
    return false;
  }

  const rule = normalizeSuccessRule(successRule);
  if (rule.mode === "any_http") {
    return true;
  }
  if (rule.mode === "2xx_3xx") {
    return statusCode >= 200 && statusCode < 400;
  }

  return (rule.customCodes || []).includes(statusCode);
}

function intervalToMs(config: ScheduleConfig): number {
  if (!config.interval.enabled) {
    return 0;
  }

  return config.interval.unit === "hours"
    ? config.interval.value * 60 * 60 * 1000
    : config.interval.value * 60 * 1000;
}

function matchesFixedTime(config: FixedTimeScheduleConfig, timestamp: number): boolean {
  if (!config.enabled) {
    return false;
  }

  const parts = getShanghaiParts(timestamp);
  if (config.month !== null && config.month !== parts.month) {
    return false;
  }
  if (config.day !== null && config.day !== parts.day) {
    return false;
  }

  return config.hour === parts.hour && config.minute === parts.minute;
}

function alreadyRanFixedSlot(lastRunTime: number | null, timestamp: number): boolean {
  if (!lastRunTime) {
    return false;
  }

  const previous = getShanghaiParts(lastRunTime);
  const current = getShanghaiParts(timestamp);
  return previous.month === current.month && previous.day === current.day && previous.hour === current.hour && previous.minute === current.minute;
}

export function shouldRunTaskNow(task: TaskConfig, timestamp: number): boolean {
  const config = normalizeScheduleConfig(task.scheduleConfig, task.schedule);

  const intervalDue = config.interval.enabled
    ? !task.lastRunTime || timestamp - task.lastRunTime >= intervalToMs(config)
    : false;

  const fixedDue = config.fixedTime.enabled
    ? matchesFixedTime(config.fixedTime, timestamp) && !alreadyRanFixedSlot(task.lastRunTime, timestamp)
    : false;

  if (!config.interval.enabled && !config.fixedTime.enabled) {
    return task.schedule === "single" && task.lastRunTime === null;
  }

  return intervalDue || fixedDue;
}

export function describeScheduleConfig(config?: ScheduleConfig, legacySchedule?: TaskSchedule): string {
  const normalized = normalizeScheduleConfig(config, legacySchedule);
  const parts: string[] = [];

  if (normalized.interval.enabled) {
    parts.push(`每 ${normalized.interval.value} ${normalized.interval.unit === "hours" ? "小时" : "分钟"}`);
  }

  if (normalized.fixedTime.enabled) {
    const month = normalized.fixedTime.month ? `${normalized.fixedTime.month}月` : "每月";
    const day = normalized.fixedTime.day ? `${normalized.fixedTime.day}日` : "每日";
    const hour = String(normalized.fixedTime.hour).padStart(2, "0");
    const minute = String(normalized.fixedTime.minute).padStart(2, "0");
    parts.push(`${month}${day} ${hour}:${minute}`);
  }

  return parts.join(" + ") || "仅手动";
}
