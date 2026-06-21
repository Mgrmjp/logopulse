import type { AudioFrame } from "../types.js";
import type { BandEnergies } from "./fft.js";
import { computeFrameBands } from "./fft.js";
import { findMaxBands, normalizeBandsWithMax } from "./normalize-audio.js";
import { createBeatDetector } from "./detect-beats.js";

export function generateAudioFrames(
  pcm: Float32Array,
  sampleRate: number,
  fps: number,
  duration: number,
  fftSize: number = 2048
): AudioFrame[] {
  const totalFrames = Math.ceil(duration * fps);
  const samplesPerFrame = Math.floor(sampleRate / fps);

  // First pass: compute all band energies
  const allBands: BandEnergies[] = [];
  for (let f = 0; f < totalFrames; f++) {
    const start = f * samplesPerFrame;
    const end = Math.min(start + fftSize, pcm.length);
    const chunk = pcm.slice(start, end);

    if (chunk.length < fftSize) {
      const padded = new Float32Array(fftSize);
      padded.set(chunk);
      allBands.push(computeFrameBands(padded, sampleRate, fftSize));
    } else {
      allBands.push(computeFrameBands(chunk, sampleRate, fftSize));
    }
  }

  // Normalize
  const maxBands = findMaxBands(allBands);
  const beatDetector = createBeatDetector();

  // Second pass: build AudioFrames
  const frames: AudioFrame[] = [];
  for (let f = 0; f < totalFrames; f++) {
    const norm = normalizeBandsWithMax(allBands[f], maxBands);
    const beat = beatDetector.process(norm.bass);
    const energy = (norm.volume + norm.bass + norm.mids + norm.highs) / 4;

    frames.push({
      frame: f,
      time: f / fps,
      volume: norm.volume,
      bass: norm.bass,
      mids: norm.mids,
      highs: norm.highs,
      beat,
      energy: Math.min(1, energy),
    });
  }

  return frames;
}
