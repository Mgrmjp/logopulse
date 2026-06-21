import type { RenderConfig, PartialRenderConfig } from "../types.js";

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const srcVal = source[key];
    if (srcVal === undefined) continue;
    if (isPlainObject(result[key]) && isPlainObject(srcVal)) {
      (result as Record<string, unknown>)[key as string] = deepMerge(
        result[key] as Record<string, unknown>,
        srcVal as Record<string, unknown>
      );
    } else {
      (result as Record<string, unknown>)[key as string] = srcVal;
    }
  }
  return result;
}

export function mergeConfig(
  defaults: RenderConfig,
  profile: PartialRenderConfig,
  fileConfig: PartialRenderConfig,
  cliOverrides: PartialRenderConfig
): RenderConfig {
  let merged = deepMerge(
    defaults as Record<string, unknown>,
    profile as Record<string, unknown>
  ) as RenderConfig;
  merged = deepMerge(
    merged as Record<string, unknown>,
    fileConfig as Record<string, unknown>
  ) as RenderConfig;
  merged = deepMerge(
    merged as Record<string, unknown>,
    cliOverrides as Record<string, unknown>
  ) as RenderConfig;
  return merged;
}
