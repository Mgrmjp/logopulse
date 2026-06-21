import { execFileSync, spawn, type ChildProcess } from "node:child_process";

export function checkFfmpegAvailable(): void {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "pipe" });
  } catch {
    throw new Error(
      "ffmpeg not found. Install it: https://ffmpeg.org/download.html"
    );
  }
}

let _videoCodec: string | null = null;
let _videoCodecUseGpu: boolean | null = null;

function detectVideoCodec(useGpu: boolean): string {
  if (_videoCodec && _videoCodecUseGpu === useGpu) return _videoCodec;

  const encoders = execFileSync("ffmpeg", ["-encoders"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (useGpu) {
    // GPU mode: h264_nvenc preferred, fall back to CPU encoders
    if (encoders.includes("h264_nvenc")) _videoCodec = "h264_nvenc";
    else if (encoders.includes("libx264")) _videoCodec = "libx264";
    else if (encoders.includes("libopenh264")) _videoCodec = "libopenh264";
    else _videoCodec = "libx264";
  } else {
    // CPU mode: libx264 preferred (better quality / preset support)
    if (encoders.includes("libx264")) _videoCodec = "libx264";
    else if (encoders.includes("libopenh264")) _videoCodec = "libopenh264";
    else if (encoders.includes("h264_nvenc")) _videoCodec = "h264_nvenc";
    else _videoCodec = "libx264"; // fallback
  }

  _videoCodecUseGpu = useGpu;
  return _videoCodec;
}

export function buildFfmpegEncodeArgs(opts: {
  width: number;
  height: number;
  fps: number;
  videoBitrate: string;
  audioBitrate: string;
  preset: string;
  crf: number;
  audioPath: string;
  outputPath: string;
  useGpu?: boolean;
}): string[] {
  const codec = detectVideoCodec(opts.useGpu ?? false);
  const args = [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${opts.width}x${opts.height}`,
    "-r", String(opts.fps),
    "-i", "pipe:0",
    "-c:v", codec,
    "-pix_fmt", "yuv420p",
  ];

  if (opts.audioPath) {
    args.push("-i", opts.audioPath, "-c:a", "aac", "-b:a", opts.audioBitrate, "-shortest");
  }

  args.push(opts.outputPath);

  // libx264 supports -preset and -crf, libopenh264 doesn't use -preset
  if (codec === "libx264") {
    args.splice(args.indexOf("-c:v") + 2, 0, "-preset", opts.preset, "-crf", String(opts.crf));
    args.splice(args.indexOf("-pix_fmt"), 0, "-b:v", opts.videoBitrate);
  } else if (codec === "libopenh264") {
    // libopenh264 uses -maxrate and -bufsize instead of -crf
    args.splice(args.indexOf("-c:v") + 2, 0, "-b:v", opts.videoBitrate);
  } else if (codec === "h264_nvenc") {
    // NVENC: use preset + bitrate (no -crf; use -b:v with optional -cq for quality)
    // GPU encoding is fast, so the slow preset is fine; "p4" is a balanced preset
    const nvencPreset = opts.preset === "veryslow" ? "p7" : opts.preset === "slow" ? "p6" : opts.preset === "medium" ? "p4" : "p2";
    args.splice(args.indexOf("-c:v") + 2, 0, "-preset", nvencPreset, "-b:v", opts.videoBitrate);
  }

  return args;
}

export function spawnFfmpegEncode(args: string[]): ChildProcess {
  return spawn("ffmpeg", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
}
