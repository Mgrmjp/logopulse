import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AudioAnalysisResult } from "../types.js";
import { getAudioMetadata } from "../encoder/ffprobe.js";
import { decodeAudio } from "./decode-audio.js";
import { generateAudioFrames } from "./audio-frame.js";
import { getFileHash } from "../utils/files.js";
import { computeHash } from "../utils/hash.js";
import { logger } from "../utils/logger.js";

export async function analyzeAudio(opts: {
  songPath: string;
  fps: number;
  outputPath?: string;
  tempDir?: string;
}): Promise<AudioAnalysisResult> {
  const { songPath, fps, outputPath, tempDir = "./tmp" } = opts;

  logger.info(`Analyzing audio: ${songPath}`);

  // Get metadata
  const meta = getAudioMetadata(songPath);
  logger.info(
    `Duration: ${meta.duration.toFixed(1)}s, Sample rate: ${meta.sampleRate}Hz`
  );

  // Check cache
  const fileHash = getFileHash(songPath);
  const cacheKey = computeHash(fileHash, fps, meta.duration);
  const cacheDir = join(tempDir, "analysis-cache");
  const cachePath = join(cacheDir, `${cacheKey}.json`);

  if (existsSync(cachePath)) {
    logger.info("Using cached analysis");
    const cached = JSON.parse(readFileSync(cachePath, "utf-8"));
    return cached as AudioAnalysisResult;
  }

  // Decode
  logger.info("Decoding audio to PCM...");
  const pcm = decodeAudio(songPath, meta.sampleRate);
  logger.info(`Decoded ${pcm.length} samples`);

  // Generate frames
  logger.info(`Generating ${fps} fps frame analysis...`);
  const frames = generateAudioFrames(pcm, meta.sampleRate, fps, meta.duration);
  logger.info(`Generated ${frames.length} audio frames`);

  const result: AudioAnalysisResult = {
    song: songPath,
    duration: meta.duration,
    fps,
    sampleRate: meta.sampleRate,
    frames,
  };

  // Cache
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(result));
  logger.info(`Cached analysis to ${cachePath}`);

  // Write output if requested
  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(result, null, 2));
    logger.info(`Wrote analysis to ${outputPath}`);
  }

  return result;
}
