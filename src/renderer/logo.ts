import type { LogoConfig } from "../types.js";
import type { CanvasRenderingContext2D, Image } from "canvas";

export function drawLogo(
  ctx: CanvasRenderingContext2D,
  logoImage: Image,
  centerX: number,
  centerY: number,
  config: LogoConfig
): void {
  const size = config.size;

  // Scale logo to fit within size while preserving aspect ratio
  const scale = Math.min(size / logoImage.width, size / logoImage.height);
  const drawW = logoImage.width * scale;
  const drawH = logoImage.height * scale;
  const x = centerX - drawW / 2;
  const y = centerY - drawH / 2;

  // Shadow
  if (config.shadow) {
    ctx.shadowColor = `rgba(0, 0, 0, ${config.shadowOpacity})`;
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
  }

  ctx.drawImage(logoImage as any, x, y, drawW, drawH);

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}
