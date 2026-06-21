import { readFileSync } from "node:fs";
import type { PartialRenderConfig } from "../types.js";

export function loadConfig(configPath: string): PartialRenderConfig {
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as PartialRenderConfig;
}
