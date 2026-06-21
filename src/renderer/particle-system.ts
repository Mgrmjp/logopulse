import type { Particle, ParticleConfig, AudioFrame, AudioReactivityConfig } from "../types.js";
import type { SafeArea } from "./safe-area.js";
import { getSafeOpacity } from "./safe-area.js";

export type ParticleState = {
  particles: Particle[];
  prevTime: number;
};

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function initParticles(
  config: { particles: ParticleConfig; output: { width: number; height: number } },
  centerX: number,
  centerY: number
): ParticleState {
  const { count, innerRadius, outerRadius } = config.particles;
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    const seed = i;
    const angle = seededRandom(seed) * Math.PI * 2;
    const r = innerRadius + seededRandom(seed + 1000) * (outerRadius - innerRadius);
    const layer = seededRandom(seed + 2000) < 0.15 ? "background" : "main";

    particles.push({
      id: i,
      x: centerX + Math.cos(angle) * r,
      y: centerY + Math.sin(angle) * r,
      baseX: centerX,
      baseY: centerY,
      angle,
      radius: r,
      baseRadius: r,
      speed: 0.2 + seededRandom(seed + 3000) * 0.8,
      size: 1 + seededRandom(seed + 4000) * config.particles.size,
      opacity: 0.3 + seededRandom(seed + 5000) * 0.7,
      life: 1,
      color: `hsl(${30 + seededRandom(seed + 6000) * 30}, ${60 + seededRandom(seed + 7000) * 40}%, ${60 + seededRandom(seed + 8000) * 30}%)`,
      velocityX: 0,
      velocityY: 0,
      layer: layer as "background" | "main",
      seed,
    });
  }

  return { particles, prevTime: 0 };
}

export function updateAndDrawParticles(
  state: ParticleState,
  audioFrame: AudioFrame,
  config: { particles: ParticleConfig; audioReactivity: AudioReactivityConfig },
  safeArea: SafeArea
): void {
  const { bass, mids, highs, volume, energy } = audioFrame;
  const { bassExpansion, speed: baseSpeed, size: baseSize, avoidLogoArea } = config.particles;
  const { bass: bassMult, mids: midsMult, highs: highsMult, volume: volMult, smoothing } = config.audioReactivity;

  const effectiveBass = bass * bassMult;
  const effectiveMids = mids * midsMult;
  const effectiveHighs = highs * highsMult;
  const effectiveVolume = volume * volMult;

  for (const p of state.particles) {
    // Bass expansion
    const expansion = effectiveBass * bassExpansion;
    p.radius = p.baseRadius + expansion;

    // Mids speed boost
    const midsBoost = 1 + effectiveMids * 3;

    // Update angle
    p.angle += p.speed * midsBoost * 0.02;

    // Compute position
    p.x = p.baseX + Math.cos(p.angle) * p.radius;
    p.y = p.baseY + Math.sin(p.angle) * p.radius;

    // Opacity: base * volume modulation
    p.opacity = p.opacity * smoothing + (0.2 + effectiveVolume * 0.8) * (1 - smoothing);

    // Highs sparkle
    if (effectiveHighs > 0.5) {
      const sparkle = seededRandom(p.seed + Math.floor(audioFrame.frame * 0.5));
      if (sparkle > 0.7) {
        p.opacity = Math.min(1, p.opacity * 1.5);
        p.size = baseSize + effectiveHighs * 2;
      }
    } else {
      p.size = baseSize;
    }

    // Safe area
    if (avoidLogoArea) {
      const safeOp = getSafeOpacity(p.x, p.y, safeArea);
      p.opacity *= safeOp;
    }

    // Energy-based size modulation
    p.size *= 0.9 + energy * 0.2;
  }
}
