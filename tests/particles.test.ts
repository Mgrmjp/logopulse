import { describe, it, expect } from "vitest";
import { initParticles } from "../src/renderer/particle-system.js";

describe("particle system", () => {
  const config = {
    particles: {
      count: 100,
      size: 2,
      speed: 1,
      innerRadius: 100,
      outerRadius: 300,
      bassExpansion: 50,
      beatBurst: true,
      beatBurstParticles: 10,
      avoidLogoArea: true,
      foregroundSparkles: false,
    },
    output: { width: 1280, height: 720 },
  };

  it("initializes correct number of particles", () => {
    const state = initParticles(config, 640, 360);
    expect(state.particles.length).toBe(100);
  });

  it("particles are within radius range", () => {
    const state = initParticles(config, 640, 360);
    for (const p of state.particles) {
      const dx = p.x - 640;
      const dy = p.y - 360;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeGreaterThanOrEqual(config.particles.innerRadius * 0.8);
      expect(dist).toBeLessThanOrEqual(config.particles.outerRadius * 1.2);
    }
  });

  it("particles have valid layer assignment", () => {
    const state = initParticles(config, 640, 360);
    const layers = state.particles.map((p) => p.layer);
    expect(layers.every((l) => l === "main" || l === "background")).toBe(true);
  });
});
