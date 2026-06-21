import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";

export function resolvePath(p: string): string {
  return resolve(p);
}

export function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}
