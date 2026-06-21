import type { SceneConfig } from "../types.js";
import type { CanvasRenderingContext2D, Image } from "canvas";
import { createCanvas as makeCanvas } from "./canvas-utils.js";

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  bgImage: Image,
  width: number,
  height: number,
  sceneConfig: SceneConfig
): void {
  // Cover crop: scale to fill, center crop
  const imgRatio = bgImage.width / bgImage.height;
  const canvasRatio = width / height;

  let sx: number, sy: number, sw: number, sh: number;
  if (imgRatio > canvasRatio) {
    sh = bgImage.height;
    sw = sh * canvasRatio;
    sx = (bgImage.width - sw) / 2;
    sy = 0;
  } else {
    sw = bgImage.width;
    sh = sw / canvasRatio;
    sx = 0;
    sy = (bgImage.height - sh) / 2;
  }

  ctx.drawImage(bgImage as any, sx, sy, sw, sh, 0, 0, width, height);

  // Blur
  if (sceneConfig.backgroundBlur > 0) {
    applyBlur(ctx, width, height, sceneConfig.backgroundBlur);
  }

  // Dark overlay
  if (sceneConfig.backgroundDarken > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${sceneConfig.backgroundDarken})`;
    ctx.fillRect(0, 0, width, height);
  }

  // Vignette
  if (sceneConfig.vignette > 0) {
    applyVignette(ctx, width, height, sceneConfig.vignette);
  }
}

function applyBlur(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number
): void {
  // Simple scale-down/scale-up blur approximation
  const scale = Math.max(0.05, 1 / (1 + radius * 0.15));
  const sw = Math.max(1, Math.floor(width * scale));
  const sh = Math.max(1, Math.floor(height * scale));

  // Read current pixels
  const imageData = ctx.getImageData(0, 0, width, height);

  // Create a small canvas and draw scaled down
  const tmp = makeCanvas(sw, sh);
  const tmpCtx = tmp.getContext("2d");

  // Put the image data onto a temp full-size canvas first
  const fullTmp = makeCanvas(width, height);
  const fullTmpCtx = fullTmp.getContext("2d");
  fullTmpCtx.putImageData(imageData, 0, 0);

  // Draw scaled down
  tmpCtx.drawImage(fullTmp as any, 0, 0, width, height, 0, 0, sw, sh);

  // Draw scaled back up
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp as any, 0, 0, sw, sh, 0, 0, width, height);
}

function applyVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strength: number
): void {
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.sqrt(cx * cx + cy * cy);

  const gradient = ctx.createRadialGradient(cx, cy, maxRadius * 0.3, cx, cy, maxRadius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, `rgba(0, 0, 0, ${strength})`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}
