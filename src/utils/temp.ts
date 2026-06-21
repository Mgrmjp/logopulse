import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export function createTempDir(base: string): string {
  const dir = join(base, `logopulse-${randomBytes(8).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
