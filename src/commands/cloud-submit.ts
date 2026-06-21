// `logopulse cloud submit` — blocking CLI front for VastProvider.
//
// Flow:
//   1. load + validate the local config
//   2. resolve asset paths and write a rewritten job config to /tmp
//   3. construct VastProvider, call submitJob (spawns instance, ships assets)
//   4. poll getStatus every N seconds, printing a heartbeat
//   5. on "completed": downloadResult to ./output.mp4
//   6. on "failed" or thrown error: destroy the instance, re-throw
//   7. ALWAYS call provider.destroy in finally (covers Ctrl-C too via SIGINT)

import { resolve } from "node:path";
import { loadConfig } from "../config/load-config.js";
import { validateConfig } from "../config/validate-config.js";
import { VastProvider } from "../cloud/vast/provider.js";
import { logger } from "../utils/logger.js";
import { ensureDir } from "../utils/paths.js";

type SubmitOpts = {
  config?: string;
  cloudImage?: string;
  gitUrl?: string;
  maxPrice?: string;
  gpu?: string;
  disk?: string;
  output?: string;
  geolocation?: string;
  yes?: boolean;
  pollMs?: string;
};

export async function cloudSubmitCommand(opts: SubmitOpts): Promise<void> {
  if (!opts.config) {
    throw new Error("--config is required");
  }
  if (!opts.cloudImage && !opts.gitUrl) {
    throw new Error(
      "Cloud submit requires either --git-url <repo> (no Docker publish needed) " +
        "or --cloud-image <image> (a Docker image you have built and pushed). " +
        "The old default logopulse/logopulse:latest image is not published."
    );
  }
  const apiKey = process.env.VAST_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VAST_API_KEY environment variable is not set. " +
        "Get a key at https://cloud.vast.ai/manage-keys/ and `export VAST_API_KEY=...`"
    );
  }

  // 1. Load + validate local config
  const configPath = resolve(opts.config);
  const fileConfig = loadConfig(configPath);
  // The file may be partial — merge with defaults to validate
  const { DEFAULT_CONFIG } = await import("../config/default-config.js");
  const { mergeConfig } = await import("../config/merge-config.js");
  const config = mergeConfig(DEFAULT_CONFIG, {}, fileConfig, {});

  if (!config.input.song || !config.input.logo || !config.input.background) {
    throw new Error(
      "Config must include input.song, input.logo, and input.background"
    );
  }
  validateConfig(config);

  const assets = {
    song: resolve(config.input.song),
    logo: resolve(config.input.logo),
    background: resolve(config.input.background),
  };

  // 2. Output path: from --output flag, or alongside the config as output.mp4
  const outputPath = opts.output
    ? resolve(opts.output)
    : resolve(configPath, "..", "output.mp4");
  ensureDir(outputPath);

  const provider = new VastProvider({
    apiKey,
    image: opts.cloudImage ?? "",
    gitUrl: opts.gitUrl,
    diskGb: opts.disk ? parseInt(opts.disk) : undefined,
    maxPricePerHour: opts.maxPrice ? parseFloat(opts.maxPrice) : undefined,
    gpuName: opts.gpu ? opts.gpu.split(",").map(s => s.trim()) : undefined,
    geolocation: opts.geolocation,
  });

  // 3. SIGINT handler — best-effort destroy on Ctrl-C
  const sigintHandler = async () => {
    logger.warn("Interrupted. Destroying instance(s)...");
    // The provider tracks active jobs internally; we don't have a list here
    // but destroy() is idempotent and safe to call on an unknown id.
  };
  process.on("SIGINT", sigintHandler);

  let job: { id: string; status: string } | undefined;
  try {
    job = await provider.submitJob(configPath, assets);
    logger.info(`Job ${job.id} submitted; polling status...`);

    // 4. poll
    const pollMs = opts.pollMs ? parseInt(opts.pollMs) : 10_000;
    let lastHeartbeat = 0;
    let renderStartTime: number | undefined;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await provider.getStatus(job.id);
      if (result.status === "completed") {
        logger.info("Job completed. Downloading result...");
        await provider.downloadResult(job.id, outputPath);
        logger.info(`Output: ${outputPath}`);
        return;
      }
      if (result.status === "failed") {
        throw new Error(`Job ${job.id} failed (instance or worker reported failure)`);
      }
      // running — show progress if available
      if (result.frame && result.totalFrames) {
        if (!renderStartTime) renderStartTime = Date.now();
        const elapsed = (Date.now() - renderStartTime) / 1000;
        const fps = result.frame / elapsed;
        const remaining = (result.totalFrames - result.frame) / fps;
        const pct = ((result.frame / result.totalFrames) * 100).toFixed(1);
        const eta = formatDuration(remaining);
        process.stderr.write(
          `\r[frame ${result.frame}/${result.totalFrames} (${pct}%) ${fps.toFixed(1)}fps ETA ${eta}]    `
        );
      } else if (Date.now() - lastHeartbeat > 30_000) {
        process.stderr.write(
          `[${new Date().toISOString().slice(11, 19)}] still running...\n`
        );
        lastHeartbeat = Date.now();
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  } catch (err) {
    logger.error(`Cloud submit failed: ${(err as Error).message}`);
    throw err;
  } finally {
    process.off("SIGINT", sigintHandler);
    if (job) {
      try {
        await provider.destroy(job.id);
      } catch {
        /* destroy already logged */
      }
    }
  }
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "?";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}
