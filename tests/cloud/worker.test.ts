import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock renderVideo to throw so we exercise the failure path without needing
// a real ffmpeg / audio file.
vi.mock("../../src/renderer/render-video.js", () => ({
  renderVideo: vi.fn(async () => {
    throw new Error("simulated render failure");
  }),
}));

// Import AFTER the mock is set up.
import { workerCommand } from "../../src/commands/worker.js";

describe("workerCommand", () => {
  it("writes status.json with status=running and then status=failed when render throws", async () => {
    const dir = mkdtempSync(join(tmpdir(), "logopulse-worker-"));
    const jobPath = join(dir, "job.json");
    const outPath = join(dir, "out.mp4");
    const statusPath = join(dir, "status.json");
    // Create fake input files so validation passes
    writeFileSync("/tmp/song.mp3", "fake");
    writeFileSync("/tmp/logo.png", "fake");
    writeFileSync("/tmp/bg.jpg", "fake");

    writeFileSync(jobPath, JSON.stringify({
      input: { song: "/tmp/song.mp3", logo: "/tmp/logo.png", background: "/tmp/bg.jpg" },
      output: { width: 320, height: 240, fps: 30 },
    }));

    process.exitCode = 0;
    await workerCommand({ job: jobPath, output: outPath, status: statusPath });

    expect(existsSync(statusPath)).toBe(true);
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    expect(status.status).toBe("failed");
    expect(status.error).toContain("simulated render failure");
    expect(process.exitCode).toBe(1);
  });

  it("writes status=failed immediately if the job file is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "logopulse-worker-"));
    const outPath = join(dir, "out.mp4");
    const statusPath = join(dir, "status.json");
    const jobPath = join(dir, "does-not-exist.json");

    process.exitCode = 0;
    await expect(
      workerCommand({ job: jobPath, output: outPath, status: statusPath })
    ).rejects.toThrow();

    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    expect(status.status).toBe("failed");
    expect(status.error).toContain("job file not found");
  });
});
