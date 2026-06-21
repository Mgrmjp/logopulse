// `logopulse worker` — runs ON the vast.ai instance, invoked by the onstart
// script after the user signals via /tmp/logopulse-start.
//
// Usage (internal, not for users):
//   logopulse worker --job <path> --output <path> --status <path>
//
// The job file is a full RenderConfig (with input paths pointing at /tmp
// where the provider SCP'd the assets). The worker runs the render, then
// writes a status JSON file with one of:
//   { "status": "completed" }
//   { "status": "failed", "error": "..." }
//
// The provider's getStatus polls this file via SSH.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadConfig } from "../config/load-config.js";
import { validateConfig } from "../config/validate-config.js";
import { renderVideo } from "../renderer/render-video.js";
import { logger } from "../utils/logger.js";
import type { RenderConfig } from "../types.js";

/**
 * Detect whether the host has a usable NVIDIA GPU and the nvenc encoder is
 * available in ffmpeg. Returns true only if both:
 *   1. `nvidia-smi` runs successfully (driver present)
 *   2. ffmpeg has h264_nvenc in its encoder list
 * Override with `LOGOPULSE_USE_GPU=0` to force CPU.
 */
export function detectGpu(): boolean {
  if (process.env.LOGOPULSE_USE_GPU === "0") return false;
  if (process.env.LOGOPULSE_USE_GPU === "1") return true;

  try {
    execFileSync("nvidia-smi", ["-L"], { stdio: "pipe", timeout: 5000 });
  } catch {
    return false;
  }

  try {
    const encoders = execFileSync("ffmpeg", ["-encoders"], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return encoders.includes("h264_nvenc");
  } catch {
    return false;
  }
}

type WorkerOpts = {
  job: string;
  output: string;
  status: string;
};

type WorkerStatus = {
  status: "running" | "completed" | "failed";
  error?: string;
  frame?: number;
  totalFrames?: number;
};

export async function workerCommand(opts: WorkerOpts): Promise<void> {
  const writeStatus = (s: WorkerStatus) => {
    try {
      mkdirSync(dirname(opts.status), { recursive: true });
      writeFileSync(opts.status, JSON.stringify(s, null, 2));
    } catch (err) {
      logger.warn(`Failed to write status file: ${err}`);
    }
  };

  writeStatus({ status: "running" });

  let config: RenderConfig;
  try {
    if (!existsSync(opts.job)) {
      throw new Error(`job file not found: ${opts.job}`);
    }
    const raw = JSON.parse(readFileSync(opts.job, "utf8")) as Partial<RenderConfig> & {
      output?: any;
      runtime?: any;
    };
    // Output is forced to --output so the provider knows where to find it.
    raw.output = { ...(raw.output ?? {}), path: opts.output };
    // Mark as cloud run in the report, and auto-detect GPU
    raw.runtime = {
      ...(raw.runtime ?? {}),
      mode: "cloud",
      cloudProvider: "vast",
      useGpu: detectGpu(),
    };
    // We require a full config to render. Merge with defaults to be safe.
    const { DEFAULT_CONFIG } = await import("../config/default-config.js");
    const { mergeConfig } = await import("../config/merge-config.js");
    const { getProfilePartial } = await import("../config/profiles.js");
    const profileName = (raw.output?.profile ?? DEFAULT_CONFIG.output.profile) as any;
    const profilePartial = getProfilePartial(profileName);
    config = mergeConfig(DEFAULT_CONFIG, profilePartial, raw, {}) as RenderConfig;
    validateConfig(config);
  } catch (err) {
    writeStatus({ status: "failed", error: `Invalid job config: ${(err as Error).message}` });
    throw err;
  }

  logger.info(`Worker starting: ${config.output.width}x${config.output.height} @ ${config.output.fps}fps`);
  logger.info(`Song: ${config.input.song}`);

  try {
    await renderVideo({ config });
    writeStatus({ status: "completed" });
    logger.info("Worker: render completed");
  } catch (err) {
    const msg = (err as Error).message;
    logger.error(`Worker: render failed: ${msg}`);
    writeStatus({ status: "failed", error: msg });
    // exit with non-zero so the onstart script's $? is non-zero
    process.exitCode = 1;
  }
}
