import { resolve } from "node:path";
import type { RenderConfig, PartialRenderConfig } from "../types.js";
import { DEFAULT_CONFIG } from "../config/default-config.js";
import { getProfilePartial } from "../config/profiles.js";
import { loadConfig } from "../config/load-config.js";
import { mergeConfig } from "../config/merge-config.js";
import { validateConfig } from "../config/validate-config.js";
import { renderVideo } from "../renderer/render-video.js";
import { setDebug, logger } from "../utils/logger.js";

type RenderOpts = {
  song?: string;
  logo?: string;
  background?: string;
  output?: string;
  config?: string;
  profile?: string;
  width?: string;
  height?: string;
  fps?: string;
  videoBitrate?: string;
  audioBitrate?: string;
  particles?: string;
  logoSize?: string;
  darken?: string;
  blur?: string;
  vignette?: string;
  gpu?: boolean;
  tempDir?: string;
  debug?: boolean;
  keepFrames?: boolean;
};

export async function renderCommand(opts: RenderOpts): Promise<void> {
  if (opts.debug) setDebug(true);

  // Build CLI overrides
  const cliOverrides: PartialRenderConfig = {};
  if (opts.song) cliOverrides.input = { ...cliOverrides.input, song: resolve(opts.song) };
  if (opts.logo) cliOverrides.input = { ...cliOverrides.input, logo: resolve(opts.logo) };
  if (opts.background) cliOverrides.input = { ...cliOverrides.input, background: resolve(opts.background) };
  if (opts.output) cliOverrides.output = { ...cliOverrides.output, path: resolve(opts.output) };
  if (opts.profile) cliOverrides.output = { ...cliOverrides.output, profile: opts.profile as any };
  if (opts.width) cliOverrides.output = { ...cliOverrides.output, width: parseInt(opts.width) };
  if (opts.height) cliOverrides.output = { ...cliOverrides.output, height: parseInt(opts.height) };
  if (opts.fps) cliOverrides.output = { ...cliOverrides.output, fps: parseInt(opts.fps) };
  if (opts.videoBitrate) cliOverrides.output = { ...cliOverrides.output, videoBitrate: opts.videoBitrate };
  if (opts.audioBitrate) cliOverrides.output = { ...cliOverrides.output, audioBitrate: opts.audioBitrate };
  if (opts.particles) cliOverrides.particles = { count: parseInt(opts.particles) };
  if (opts.logoSize) cliOverrides.logo = { ...cliOverrides.logo, size: parseInt(opts.logoSize) };
  if (opts.darken) cliOverrides.scene = { ...cliOverrides.scene, backgroundDarken: parseFloat(opts.darken) };
  if (opts.blur) cliOverrides.scene = { ...cliOverrides.scene, backgroundBlur: parseFloat(opts.blur) };
  if (opts.vignette) cliOverrides.scene = { ...cliOverrides.scene, vignette: parseFloat(opts.vignette) };
  if (opts.gpu) cliOverrides.runtime = { ...cliOverrides.runtime, useGpu: true };
  if (opts.tempDir) cliOverrides.runtime = { ...cliOverrides.runtime, tempDir: resolve(opts.tempDir) };
  if (opts.debug) cliOverrides.runtime = { ...cliOverrides.runtime, debug: true };
  if (opts.keepFrames) cliOverrides.runtime = { ...cliOverrides.runtime, keepFrames: true };

  // Load config file if provided
  const fileConfig: PartialRenderConfig = opts.config
    ? loadConfig(resolve(opts.config))
    : {};

  // Apply profile
  const profileName = (cliOverrides.output?.profile ||
    fileConfig.output?.profile ||
    opts.profile ||
    "ultra") as any;
  const profilePartial = getProfilePartial(profileName);

  // Merge all layers
  const config = mergeConfig(DEFAULT_CONFIG, profilePartial, fileConfig, cliOverrides);

  // Ensure paths are resolved
  config.input.song = resolve(config.input.song);
  config.input.logo = resolve(config.input.logo);
  config.input.background = resolve(config.input.background);
  config.output.path = resolve(config.output.path);

  // Validate
  validateConfig(config);

  logger.info("Configuration valid");
  logger.info(
    `Profile: ${config.output.profile} | ${config.output.width}x${config.output.height} @ ${config.output.fps}fps`
  );
  logger.info(`Particles: ${config.particles.count}`);

  // Render
  await renderVideo({ config });
}
