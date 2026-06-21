import { createCanvas, loadImage } from "canvas";
import type { Canvas, CanvasRenderingContext2D, Image } from "canvas";
import type { RenderConfig, AudioFrame } from "../types.js";
import { drawBackground } from "./background.js";
import { drawLogo } from "./logo.js";
import { updateAndDrawParticles, type ParticleState } from "./particle-system.js";
import { updateAndDrawBursts, type BurstState } from "./burst-system.js";
import { createSafeArea, type SafeArea } from "./safe-area.js";

export type SceneState = {
  canvas: Canvas;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  config: RenderConfig;
  bgImage: Image;
  logoImage: Image;
  particles: ParticleState;
  bursts: BurstState;
  safeArea: SafeArea;
  frameIndex: number;
};

export async function initScene(config: RenderConfig): Promise<SceneState> {
  const { width, height } = config.output;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Load images in parallel
  const [bgImage, logoImage] = await Promise.all([
    loadImage(config.input.background),
    loadImage(config.input.logo),
  ]);

  const centerX = width / 2;
  const centerY = height / 2;

  const safeArea = createSafeArea(centerX, centerY, config.logo.safeRadius);

  const particles = initParticles(config, centerX, centerY);

  return {
    canvas,
    ctx,
    width,
    height,
    centerX,
    centerY,
    config,
    bgImage,
    logoImage,
    particles,
    bursts: { particles: [] },
    safeArea,
    frameIndex: 0,
  };
}

import { initParticles } from "./particle-system.js";

export function renderFrame(
  state: SceneState,
  audioFrame: AudioFrame
): Buffer {
  const { ctx, width, height, config, bgImage, logoImage } = state;

  // Clear
  ctx.clearRect(0, 0, width, height);

  // 1. Background
  drawBackground(ctx, bgImage, width, height, config.scene);

  // 2. Update and draw main particles
  updateAndDrawParticles(state.particles, audioFrame, state.config, state.safeArea);

  // 3. Draw main particles
  drawParticleLayer(ctx, state.particles, "main");

  // 4. Beat bursts
  if (audioFrame.beat > 0.3 && config.particles.beatBurst) {
    spawnBurst(state.bursts, state.config, state.safeArea);
  }
  updateAndDrawBursts(state.bursts, audioFrame, state.config);
  drawBurstLayer(ctx, state.bursts);

  // 5. Logo (always on top)
  drawLogo(ctx, logoImage, state.centerX, state.centerY, config.logo);

  state.frameIndex++;
  return state.canvas.toBuffer("raw");
}

function drawParticleLayer(
  ctx: CanvasRenderingContext2D,
  particles: ParticleState,
  layer: string
): void {
  for (const p of particles.particles) {
    if (p.layer !== layer) continue;
    if (p.opacity <= 0.01) continue;

    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBurstLayer(
  ctx: CanvasRenderingContext2D,
  bursts: BurstState
): void {
  for (const p of bursts.particles) {
    if (p.opacity <= 0.01) continue;

    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function spawnBurst(
  bursts: BurstState,
  config: RenderConfig,
  safeArea: SafeArea
): void {
  const count = config.particles.beatBurstParticles;
  const { centerX, centerY } = safeArea;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const startRadius = config.logo.safeRadius + 10 + Math.random() * 30;
    const speed = 2 + Math.random() * 4;

    bursts.particles.push({
      x: centerX + Math.cos(angle) * startRadius,
      y: centerY + Math.sin(angle) * startRadius,
      angle,
      speed,
      size: 1 + Math.random() * 2.5,
      opacity: 0.7 + Math.random() * 0.3,
      life: 1.0,
      decay: 1.5 + Math.random() * 1.0,
      color: `hsl(${40 + Math.random() * 30}, 90%, ${70 + Math.random() * 30}%)`,
    });
  }
}
