import type { AudioFrame, ParticleConfig, AudioReactivityConfig } from "../types.js";

export type BurstParticle = {
  x: number;
  y: number;
  angle: number;
  speed: number;
  size: number;
  opacity: number;
  life: number;
  decay: number;
  color: string;
};

export type BurstState = {
  particles: BurstParticle[];
};

export function updateAndDrawBursts(
  state: BurstState,
  audioFrame: AudioFrame,
  config: { particles: ParticleConfig; audioReactivity: AudioReactivityConfig }
): void {
  const dt = 1 / 60; // assume 60fps

  // Update existing burst particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;
    p.life -= p.decay * dt;
    p.opacity = Math.max(0, p.life);
    p.speed *= 0.97;

    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
}
