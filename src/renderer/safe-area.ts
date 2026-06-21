export type SafeArea = {
  centerX: number;
  centerY: number;
  radius: number;
};

export function createSafeArea(
  centerX: number,
  centerY: number,
  radius: number
): SafeArea {
  return { centerX, centerY, radius };
}

export function getSafeOpacity(
  x: number,
  y: number,
  area: SafeArea
): number {
  const dx = x - area.centerX;
  const dy = y - area.centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist >= area.radius) return 1;

  // Linear fade from 0 at center to 1 at radius edge
  return Math.max(0, dist / area.radius);
}

export function clampToSafeRadius(
  x: number,
  y: number,
  area: SafeArea,
  minRadius: number
): { x: number; y: number } {
  const dx = x - area.centerX;
  const dy = y - area.centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist >= minRadius) return { x, y };

  const angle = Math.atan2(dy, dx);
  return {
    x: area.centerX + Math.cos(angle) * minRadius,
    y: area.centerY + Math.sin(angle) * minRadius,
  };
}
