import { describe, it, expect } from "vitest";
import { createSafeArea, getSafeOpacity, clampToSafeRadius } from "../src/renderer/safe-area.js";

describe("safe area", () => {
  const area = createSafeArea(640, 360, 100);

  it("returns full opacity outside safe radius", () => {
    expect(getSafeOpacity(640 + 200, 360, area)).toBe(1);
  });

  it("returns 0 at center", () => {
    expect(getSafeOpacity(640, 360, area)).toBe(0);
  });

  it("returns ~0.5 at half radius", () => {
    const op = getSafeOpacity(640 + 50, 360, area);
    expect(op).toBeCloseTo(0.5, 1);
  });

  it("clampToSafeRadius pushes point outward", () => {
    const result = clampToSafeRadius(640, 360, area, 120);
    const dx = result.x - 640;
    const dy = result.y - 360;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeGreaterThanOrEqual(120);
  });
});
