import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { RenderConfig, AudioFrame, AudioAnalysisResult, RenderReport } from "../types.js";
import { getAudioMetadata } from "../encoder/ffprobe.js";
import { analyzeAudio } from "../audio/analyze-audio.js";
import { initScene, renderFrame } from "./scene.js";
import { showProgress } from "../utils/progress.js";
import { logger } from "../utils/logger.js";
import { createTempDir, cleanupTempDir } from "../utils/temp.js";
import { buildFfmpegEncodeArgs } from "../encoder/ffmpeg.js";

export type RenderOptions = {
  config: RenderConfig;
  previewSeconds?: number;
};

export async function renderVideo(opts: RenderOptions): Promise<void> {
  const { config, previewSeconds } = opts;
  const startTime = Date.now();

  logger.info("Starting render pipeline...");

  // Validate inputs
  const meta = getAudioMetadata(config.input.song);
  logger.info(`Song duration: ${meta.duration.toFixed(1)}s`);

  const renderDuration = previewSeconds
    ? Math.min(previewSeconds, meta.duration)
    : meta.duration;
  const totalFrames = Math.ceil(renderDuration * config.output.fps);

  logger.info(
    `Rendering ${totalFrames} frames at ${config.output.width}x${config.output.height} @ ${config.output.fps}fps`
  );

  // Audio analysis
  const analysis = await analyzeAudio({
    songPath: config.input.song,
    fps: config.output.fps,
    tempDir: config.runtime.tempDir,
  });

  // Limit frames for preview
  const framesToRender = analysis.frames.slice(0, totalFrames);

  // Init scene
  logger.info("Initializing renderer...");
  const scene = await initScene(config);
  logger.info("Scene initialized");

  // Spawn ffmpeg for video encoding
  const tempDir = createTempDir(config.runtime.tempDir);
  const videoPath = join(tempDir, "video.mp4");
  const outputPath = config.output.path;

  logger.info(
    `Starting ffmpeg encoder (useGpu=${config.runtime.useGpu})...`
  );
  const ffmpeg = spawnFfmpegEncoder(config, videoPath);

  let ffmpegError = "";
  ffmpeg.stderr?.on("data", (chunk: Buffer) => {
    const str = chunk.toString();
    if (config.runtime.debug) {
      logger.debug(`ffmpeg: ${str.trim()}`);
    }
    ffmpegError += str;
  });

  // Render frames and pipe to ffmpeg
  const frameSize = config.output.width * config.output.height * 4;
  logger.info(`Frame buffer: ${(frameSize / 1024 / 1024).toFixed(1)}MB per frame`);

  for (let i = 0; i < framesToRender.length; i++) {
    const audioFrame = framesToRender[i];
    const buffer = renderFrame(scene, audioFrame);

    // Write raw RGBA to ffmpeg stdin
    const canWrite = ffmpeg.stdin!.write(buffer);
    if (!canWrite) {
      await new Promise<void>((resolve) => ffmpeg.stdin!.once("drain", resolve));
    }

    if (i % 30 === 0 || i === framesToRender.length - 1) {
      showProgress(i + 1, framesToRender.length, "Rendering");
    }
  }

  ffmpeg.stdin!.end();

  // Wait for ffmpeg to finish
  await new Promise<void>((resolve, reject) => {
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${ffmpegError.slice(-500)}`));
    });
  });

  logger.info("Video encoding complete");

  // Mux with audio
  if (existsSync(videoPath)) {
    logger.info("Muxing audio...");
    await muxAudio(videoPath, config.input.song, outputPath, config);
    logger.info(`Output: ${outputPath}`);
  }

  // Render report
  const endTime = Date.now();
  const report: RenderReport = {
    output: outputPath,
    profile: config.output.profile,
    width: config.output.width,
    height: config.output.height,
    fps: config.output.fps,
    duration: renderDuration,
    particles: config.particles.count,
    renderMode: "local",
    success: true,
    renderDuration: (endTime - startTime) / 1000,
  };

  const reportPath = join(config.runtime.tempDir, "render-report.json");
  mkdirSync(config.runtime.tempDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  logger.info(`Render report: ${reportPath}`);

  // Cleanup
  if (!config.runtime.keepFrames) {
    cleanupTempDir(tempDir);
  }

  logger.info(
    `Render complete in ${((endTime - startTime) / 1000).toFixed(1)}s`
  );
}

function spawnFfmpegEncoder(
  config: RenderConfig,
  outputPath: string
): ChildProcess {
  // Auto-detect codec. When useGpu is true, prefer h264_nvenc; otherwise
  // prefer libx264. The encoder detection lives in src/encoder/ffmpeg.ts and
  // is cached on first call.
  const useGpu = config.runtime.useGpu;
  const args = buildFfmpegEncodeArgs({
    width: config.output.width,
    height: config.output.height,
    fps: config.output.fps,
    videoBitrate: config.output.videoBitrate,
    audioBitrate: config.output.audioBitrate,
    preset: "medium",
    crf: 18,
    audioPath: "", // unused: we mux audio separately
    outputPath,
    useGpu,
  });

  return spawn("ffmpeg", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

async function muxAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  config: RenderConfig
): Promise<void> {
  const { execFileSync } = await import("node:child_process");

  const args = [
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", config.output.audioBitrate,
    "-shortest",
    outputPath,
  ];

  execFileSync("ffmpeg", args, { stdio: "pipe" });
}
