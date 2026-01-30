export type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = {
  level: LogLevel;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
};

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const resolveLevel = () => {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw as LogLevel;
  }
  return "info";
};

const activeLevel = resolveLevel();

const shouldLog = (level: LogLevel) => LEVELS[level] >= LEVELS[activeLevel];

const write = (payload: LogPayload) => {
  const line = JSON.stringify(payload);
  switch (payload.level) {
    case "debug":
      console.debug(line);
      break;
    case "info":
      console.info(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
    default:
      console.log(line);
  }
};

const log = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
  if (!shouldLog(level)) {
    return;
  }
  write({
    level,
    message,
    timestamp: new Date().toISOString(),
    meta,
  });
};

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
};
