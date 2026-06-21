import type { BandEnergies } from "./fft.js";

export type BandScale = BandEnergies & { volume: number };

export function findMaxBands(allBands: BandEnergies[]): BandScale {
  let maxVol = 0;
  let maxBass = 0;
  let maxLowMids = 0;
  let maxMids = 0;
  let maxHighs = 0;

  for (const b of allBands) {
    // volume is approximated by sum of all bands
    const vol = b.bass + b.lowMids + b.mids + b.highs;
    if (vol > maxVol) maxVol = vol;
    if (b.bass > maxBass) maxBass = b.bass;
    if (b.lowMids > maxLowMids) maxLowMids = b.lowMids;
    if (b.mids > maxMids) maxMids = b.mids;
    if (b.highs > maxHighs) maxHighs = b.highs;
  }

  return {
    volume: maxVol || 1,
    bass: maxBass || 1,
    lowMids: maxLowMids || 1,
    mids: maxMids || 1,
    highs: maxHighs || 1,
  };
}

export function normalizeBandsWithMax(
  bands: BandEnergies,
  maxBands: BandScale
): { volume: number; bass: number; mids: number; highs: number } {
  const vol = bands.bass + bands.lowMids + bands.mids + bands.highs;
  return {
    volume: Math.min(1, vol / maxBands.volume),
    bass: Math.min(1, bands.bass / maxBands.bass),
    mids: Math.min(1, (bands.lowMids + bands.mids) / (maxBands.lowMids + maxBands.mids)),
    highs: Math.min(1, bands.highs / maxBands.highs),
  };
}
