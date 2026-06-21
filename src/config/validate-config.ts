import type { RenderConfig } from "../types.js";
import { fileExists, isSupportedAudio, isSupportedLogo, isSupportedBackground } from "../utils/files.js";
import { ensureDir } from "../utils/paths.js";

export function validateConfig(config: RenderConfig): void {
  const { input, output } = config;

  if (!input.song) throw new Error("Missing required input: song");
  if (!input.logo) throw new Error("Missing required input: logo");
  if (!input.background) throw new Error("Missing required input: background");

  if (!fileExists(input.song)) {
    throw new Error(`Song file not found: ${input.song}`);
  }
  if (!fileExists(input.logo)) {
    throw new Error(`Logo file not found: ${input.logo}`);
  }
  if (!fileExists(input.background)) {
    throw new Error(`Background file not found: ${input.background}`);
  }

  if (!isSupportedAudio(input.song)) {
    throw new Error(
      `Unsupported audio format: ${input.song}. Supported: mp3, wav, flac`
    );
  }
  if (!isSupportedLogo(input.logo)) {
    throw new Error(
      `Unsupported logo format: ${input.logo}. Supported: png, jpg, svg`
    );
  }
  if (!isSupportedBackground(input.background)) {
    throw new Error(
      `Unsupported background format: ${input.background}. Supported: jpg, png, webp`
    );
  }

  if (output.width < 320 || output.width > 7680) {
    throw new Error(`Invalid width: ${output.width}. Must be 320-7680.`);
  }
  if (output.height < 240 || output.height > 4320) {
    throw new Error(`Invalid height: ${output.height}. Must be 240-4320.`);
  }
  if (output.fps < 1 || output.fps > 120) {
    throw new Error(`Invalid fps: ${output.fps}. Must be 1-120.`);
  }

  ensureDir(output.path);
}
