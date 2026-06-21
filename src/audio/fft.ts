import FFT from "fft.js";

export type BandEnergies = {
  bass: number;
  lowMids: number;
  mids: number;
  highs: number;
};

const BAND_RANGES: Record<keyof BandEnergies, [number, number]> = {
  bass: [20, 150],
  lowMids: [150, 500],
  mids: [500, 2000],
  highs: [2000, 12000],
};

export function computeFrameBands(
  pcmChunk: Float32Array,
  sampleRate: number,
  fftSize: number = 2048
): BandEnergies {
  const fft = new FFT(fftSize);

  // fft.js requires Float64Array and realTransform for real input
  const input = new Float64Array(fftSize);
  const len = Math.min(pcmChunk.length, fftSize);
  for (let i = 0; i < len; i++) {
    input[i] = pcmChunk[i];
  }

  const spectrum = new Float64Array(fftSize * 2);
  fft.realTransform(spectrum, input);

  // Compute magnitude spectrum (only first half is useful)
  const magnitudes = new Float64Array(fftSize / 2);
  for (let i = 0; i < fftSize / 2; i++) {
    const re = spectrum[2 * i];
    const im = spectrum[2 * i + 1];
    magnitudes[i] = Math.sqrt(re * re + im * im) / fftSize;
  }

  const freqPerBin = sampleRate / fftSize;
  const result: BandEnergies = { bass: 0, lowMids: 0, mids: 0, highs: 0 };

  for (const [band, [lo, hi]] of Object.entries(BAND_RANGES) as [
    keyof BandEnergies,
    [number, number]
  ][]) {
    const loBin = Math.max(1, Math.floor(lo / freqPerBin));
    const hiBin = Math.min(magnitudes.length - 1, Math.ceil(hi / freqPerBin));
    let sum = 0;
    let count = 0;
    for (let i = loBin; i <= hiBin; i++) {
      sum += magnitudes[i];
      count++;
    }
    result[band] = count > 0 ? sum / count : 0;
  }

  return result;
}

export function normalizeBands(bands: BandEnergies, maxBands: BandEnergies): BandEnergies {
  return {
    bass: maxBands.bass > 0 ? bands.bass / maxBands.bass : 0,
    lowMids: maxBands.lowMids > 0 ? bands.lowMids / maxBands.lowMids : 0,
    mids: maxBands.mids > 0 ? bands.mids / maxBands.mids : 0,
    highs: maxBands.highs > 0 ? bands.highs / maxBands.highs : 0,
  };
}
