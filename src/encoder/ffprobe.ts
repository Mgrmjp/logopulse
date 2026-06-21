import { execFileSync } from "node:child_process";
import type { AudioMetadata } from "../types.js";

export function checkFfmpegAvailable(): void {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "pipe" });
  } catch {
    throw new Error(
      "ffmpeg not found. Install it: https://ffmpeg.org/download.html"
    );
  }
}

export function checkFfprobeAvailable(): void {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "pipe" });
  } catch {
    throw new Error(
      "ffprobe not found. Install it: https://ffmpeg.org/download.html"
    );
  }
}

export function getAudioMetadata(songPath: string): AudioMetadata {
  checkFfprobeAvailable();

  const out = execFileSync(
    "ffprobe",
    [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      songPath,
    ],
    { encoding: "utf-8" }
  );

  const data = JSON.parse(out);
  const audioStream = data.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "audio"
  );

  if (!audioStream) {
    throw new Error(`No audio stream found in: ${songPath}`);
  }

  return {
    duration: parseFloat(data.format?.duration || "0"),
    sampleRate: parseInt(audioStream.sample_rate || "44100", 10),
    channels: audioStream.channels || 1,
    bitrate: parseInt(data.format?.bit_rate || "0", 10),
  };
}
