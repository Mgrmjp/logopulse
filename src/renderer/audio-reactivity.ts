import type { AudioReactivityConfig } from "../types.js";

export type MappedAudio = {
  volume: number;
  bass: number;
  mids: number;
  highs: number;
  beat: number;
  energy: number;
};

export function mapAudioReactivity(
  frame: { volume: number; bass: number; mids: number; highs: number; beat: number; energy: number },
  config: AudioReactivityConfig
): MappedAudio {
  return {
    volume: frame.volume * config.volume,
    bass: frame.bass * config.bass,
    mids: frame.mids * config.mids,
    highs: frame.highs * config.highs,
    beat: frame.beat * config.beat,
    energy: frame.energy,
  };
}
