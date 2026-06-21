import type { SceneState } from "./scene.js";
import type { AudioFrame } from "../types.js";
import { renderFrame } from "./scene.js";

export function renderSingleFrame(
  state: SceneState,
  audioFrame: AudioFrame
): Buffer {
  return renderFrame(state, audioFrame);
}
