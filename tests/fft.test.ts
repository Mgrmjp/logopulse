import { describe, it, expect } from "vitest";
import { computeFrameBands } from "../src/audio/fft.js";

describe("FFT", () => {
  it("bass frequency peaks in bass band", () => {
    // 100Hz sine wave
    const sampleRate = 44100;
    const fftSize = 2048;
    const freq = 100;
    const chunk = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      chunk[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }

    const bands = computeFrameBands(chunk, sampleRate, fftSize);
    expect(bands.bass).toBeGreaterThan(bands.mids);
    expect(bands.bass).toBeGreaterThan(bands.highs);
  });

  it("high frequency peaks in highs band", () => {
    const sampleRate = 44100;
    const fftSize = 2048;
    const freq = 5000;
    const chunk = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      chunk[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }

    const bands = computeFrameBands(chunk, sampleRate, fftSize);
    expect(bands.highs).toBeGreaterThan(bands.bass);
  });

  it("silence produces near-zero bands", () => {
    const chunk = new Float32Array(2048);
    const bands = computeFrameBands(chunk, 44100, 2048);
    expect(bands.bass).toBeLessThan(0.01);
    expect(bands.mids).toBeLessThan(0.01);
  });
});
