import { describe, it, expect } from "vitest";
import { buildFfmpegEncodeArgs } from "../src/encoder/ffmpeg.js";

describe("ffmpeg args", () => {
  it("generates valid encode args", () => {
    const args = buildFfmpegEncodeArgs({
      width: 1920,
      height: 1080,
      fps: 30,
      videoBitrate: "12M",
      audioBitrate: "320k",
      preset: "veryfast",
      crf: 23,
      audioPath: "/tmp/song.mp3",
      outputPath: "/tmp/output.mp4",
    });

    expect(args).toContain("-f");
    expect(args).toContain("rawvideo");
    expect(args).toContain("1920x1080");
    expect(args).toContain("/tmp/song.mp3");
    expect(args).toContain("/tmp/output.mp4");
  });
});
