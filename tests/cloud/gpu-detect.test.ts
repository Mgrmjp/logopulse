import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";

describe("detectGpu", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.mocked(execFileSync).mockReset();
    delete process.env.LOGOPULSE_USE_GPU;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns false when LOGOPULSE_USE_GPU=0 is set (override)", async () => {
    process.env.LOGOPULSE_USE_GPU = "0";
    const { detectGpu } = await import("../../src/commands/worker.js");
    expect(detectGpu()).toBe(false);
    // Should not have called nvidia-smi at all
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("returns true when LOGOPULSE_USE_GPU=1 is set (override)", async () => {
    process.env.LOGOPULSE_USE_GPU = "1";
    const { detectGpu } = await import("../../src/commands/worker.js");
    expect(detectGpu()).toBe(true);
    // Should not have called nvidia-smi or ffmpeg
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("returns false when nvidia-smi is not present", async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("nvidia-smi: command not found");
    });
    const { detectGpu } = await import("../../src/commands/worker.js");
    expect(detectGpu()).toBe(false);
  });

  it("returns true when nvidia-smi runs and ffmpeg has h264_nvenc", async () => {
    vi.mocked(execFileSync).mockImplementation((cmd: any) => {
      const c = String(cmd);
      if (c.includes("nvidia-smi")) return Buffer.from("GPU 0: Test");
      if (c.includes("ffmpeg")) return Buffer.from("... h264_nvenc ... libx264 ...");
      throw new Error("unexpected");
    });
    const { detectGpu } = await import("../../src/commands/worker.js");
    expect(detectGpu()).toBe(true);
  });

  it("returns false when nvidia-smi runs but ffmpeg lacks h264_nvenc", async () => {
    vi.mocked(execFileSync).mockImplementation((cmd: any) => {
      const c = String(cmd);
      if (c.includes("nvidia-smi")) return Buffer.from("GPU 0: Test");
      if (c.includes("ffmpeg")) return Buffer.from("... libx264 ... libopenh264 ...");
      throw new Error("unexpected");
    });
    const { detectGpu } = await import("../../src/commands/worker.js");
    expect(detectGpu()).toBe(false);
  });
});
