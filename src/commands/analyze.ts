import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { analyzeAudio } from "../audio/analyze-audio.js";
import { logger } from "../utils/logger.js";

type AnalyzeOpts = {
  song?: string;
  fps?: string;
  output?: string;
};

export async function analyzeCommand(opts: AnalyzeOpts): Promise<void> {
  if (!opts.song) {
    logger.error("Missing required option: --song");
    process.exit(1);
  }

  const fps = opts.fps ? parseInt(opts.fps) : 60;
  const outputPath = opts.output ? resolve(opts.output) : undefined;

  const result = await analyzeAudio({
    songPath: resolve(opts.song),
    fps,
    outputPath,
  });

  if (!outputPath) {
    console.log(JSON.stringify(result, null, 2));
  }

  logger.info(
    `Analysis complete: ${result.frames.length} frames, ${result.duration.toFixed(1)}s`
  );
}
