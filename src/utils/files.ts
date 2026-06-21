import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const SUPPORTED_AUDIO = new Set([".mp3", ".wav", ".flac"]);
const SUPPORTED_LOGO = new Set([".png", ".jpg", ".jpeg", ".svg"]);
const SUPPORTED_BG = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function getFileHash(path: string): string {
  const data = readFileSync(path);
  return createHash("sha256").update(data).digest("hex");
}

export function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot).toLowerCase() : "";
}

export function isSupportedAudio(path: string): boolean {
  return SUPPORTED_AUDIO.has(getExtension(path));
}

export function isSupportedLogo(path: string): boolean {
  return SUPPORTED_LOGO.has(getExtension(path));
}

export function isSupportedBackground(path: string): boolean {
  return SUPPORTED_BG.has(getExtension(path));
}
