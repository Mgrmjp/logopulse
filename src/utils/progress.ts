import { logger } from "./logger.js";

export function showProgress(current: number, total: number, label: string): void {
  const pct = Math.round((current / total) * 100);
  const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
  logger.info(`\r${label} [${bar}] ${pct}% (${current}/${total})`);
}
