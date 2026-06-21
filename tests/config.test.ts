import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../src/config/default-config.js";
import { getProfilePartial, getProfile } from "../src/config/profiles.js";
import { mergeConfig } from "../src/config/merge-config.js";

describe("DEFAULT_CONFIG", () => {
  it("has correct defaults", () => {
    expect(DEFAULT_CONFIG.output.width).toBe(3840);
    expect(DEFAULT_CONFIG.output.height).toBe(2160);
    expect(DEFAULT_CONFIG.output.fps).toBe(60);
    expect(DEFAULT_CONFIG.particles.count).toBe(5000);
    expect(DEFAULT_CONFIG.logo.safeRadius).toBe(380);
  });
});

describe("profiles", () => {
  it("preview profile has 720p settings", () => {
    const p = getProfile("preview");
    expect(p.output.width).toBe(1280);
    expect(p.output.height).toBe(720);
    expect(p.output.fps).toBe(30);
    expect(p.particles.count).toBe(1200);
  });

  it("ultra profile has 4K settings", () => {
    const p = getProfile("ultra");
    expect(p.output.width).toBe(3840);
    expect(p.output.height).toBe(2160);
    expect(p.output.fps).toBe(60);
    expect(p.particles.count).toBe(5000);
  });
});

describe("mergeConfig", () => {
  it("applies profile over defaults", () => {
    const profile = getProfilePartial("preview");
    const merged = mergeConfig(DEFAULT_CONFIG, profile, {}, {});
    expect(merged.output.width).toBe(1280);
    expect(merged.output.height).toBe(720);
    expect(merged.particles.count).toBe(1200);
  });

  it("applies file config over profile", () => {
    const profile = getProfilePartial("preview");
    const fileConfig = { output: { width: 1920 } };
    const merged = mergeConfig(DEFAULT_CONFIG, profile, fileConfig, {});
    expect(merged.output.width).toBe(1920);
    expect(merged.output.height).toBe(720);
  });

  it("applies CLI overrides over everything", () => {
    const profile = getProfilePartial("preview");
    const cli = { output: { width: 640, fps: 24 } };
    const merged = mergeConfig(DEFAULT_CONFIG, profile, {}, cli);
    expect(merged.output.width).toBe(640);
    expect(merged.output.fps).toBe(24);
    expect(merged.output.height).toBe(720);
  });
});
