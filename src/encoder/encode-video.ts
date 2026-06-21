import { execFileSync } from "node:child_process";
import type { RenderConfig } from "../types.js";

export function encodeVideo(opts: {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  config: RenderConfig;
}): void {
  const args = [
    "-y",
    "-i", opts.videoPath,
    "-i", opts.audioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", opts.config.output.audioBitrate,
    "-shortest",
    opts.outputPath,
  ];

  execFileSync("ffmpeg", args, { stdio: "pipe" });
}
