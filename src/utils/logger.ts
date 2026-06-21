type LogLevel = "info" | "warn" | "error" | "debug";

let debugEnabled = false;

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function formatMsg(level: LogLevel, msg: string): string {
  return `[${timestamp()}] [${level.toUpperCase()}] ${msg}`;
}

export const logger = {
  info(msg: string): void {
    console.error(formatMsg("info", msg));
  },
  warn(msg: string): void {
    console.error(formatMsg("warn", msg));
  },
  error(msg: string): void {
    console.error(formatMsg("error", msg));
  },
  debug(msg: string): void {
    if (debugEnabled) {
      console.error(formatMsg("debug", msg));
    }
  },
};
