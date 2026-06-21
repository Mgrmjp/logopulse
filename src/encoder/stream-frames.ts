import { spawn, type ChildProcess } from "node:child_process";
import type { RenderConfig } from "../types.js";

export type FrameStream = {
  process: ChildProcess;
  write: (frame: Buffer) => boolean;
  end: () => Promise<void>;
};

export function createFrameStream(config: RenderConfig): FrameStream {
  const args = [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${config.output.width}x${config.output.height}`,
    "-r", String(config.output.fps),
    "-i", "pipe:0",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-b:v", config.output.videoBitrate,
    "-pix_fmt", "yuv420p",
    "-an",
    "pipe:1",
  ];

  const proc = spawn("ffmpeg", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  return {
    process: proc,
    write: (frame: Buffer) => proc.stdin!.write(frame),
    end: () =>
      new Promise<void>((resolve, reject) => {
        proc.stdin!.end();
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exited with code ${code}`));
        });
      }),
  };
}
