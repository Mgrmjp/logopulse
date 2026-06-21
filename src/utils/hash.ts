import { createHash } from "node:crypto";

export function computeHash(...parts: (string | number)[]): string {
  const h = createHash("sha256");
  for (const part of parts) {
    h.update(String(part));
  }
  return h.digest("hex");
}
