import { execFileSync } from "node:child_process";

export function decodeAudio(
  songPath: string,
  sampleRate: number = 44100
): Float32Array {
  const args = [
    "-i", songPath,
    "-f", "f32le",
    "-ac", "1",
    "-ar", String(sampleRate),
    "-acodec", "pcm_f32le",
    "pipe:1",
  ];

  const buf = execFileSync("ffmpeg", args, {
    maxBuffer: 1024 * 1024 * 100,
  });

  // f32le = 4 bytes per sample
  const sampleCount = buf.length / 4;
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = buf.readFloatLE(i * 4);
  }

  return float32;
}
