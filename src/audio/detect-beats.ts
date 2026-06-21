export type BeatDetector = {
  /** Process a new bass energy value, returns beat intensity 0-1 */
  process: (bassEnergy: number) => number;
};

export function createBeatDetector(
  threshold: number = 1.4,
  decay: number = 0.98
): BeatDetector {
  let avgEnergy = 0;
  let peakHold = 0;

  return {
    process(bassEnergy: number): number {
      // Update running average
      avgEnergy = avgEnergy * decay + bassEnergy * (1 - decay);

      // Beat = how much current energy exceeds average
      if (avgEnergy > 0.001) {
        const ratio = bassEnergy / avgEnergy;
        if (ratio > threshold && bassEnergy > 0.05) {
          peakHold = Math.min(1.0, (ratio - threshold) * 0.8);
        }
      }

      // Decay peak
      const beat = peakHold;
      peakHold *= 0.85;
      if (peakHold < 0.01) peakHold = 0;

      return beat;
    },
  };
}
