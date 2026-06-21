import { createCanvas as nodeCreateCanvas } from "canvas";
import type { Canvas } from "canvas";

export function createCanvas(width: number, height: number): Canvas {
  return nodeCreateCanvas(width, height);
}
