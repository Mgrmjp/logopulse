import { resolve } from "node:path";
import type { RenderConfig, PartialRenderConfig } from "../types.js";
import { DEFAULT_CONFIG } from "../config/default-config.js";
import { getProfilePartial } from "../config/profiles.js";
import { mergeConfig } from "../config/merge-config.js";
import { validateConfig } from "../config/validate-config.js";
import { renderVideo } from "../renderer/render-video.js";
import { setDebug, logger } from "../utils/logger.js";

type PreviewOpts = {
  song?: string;
  logo?: string;
  background?: string;
  output?: string;
  seconds?: string;
  debug?: boolean;
};

export async function previewCommand(opts: PreviewOpts): Promise<void> {
  if (opts.debug) setDebug(true);

  if (!opts.song || !opts.logo || !opts.background || !opts.output) {
    logger.error("Missing required options: --song, --logo, --background, --output");
    process.exit(1);
  }

  const profilePartial = getProfilePartial("preview");

  const cliOverrides: PartialRenderConfig = {
    input: {
      song: resolve(opts.song),
      logo: resolve(opts.logo),
      background: resolve(opts.background),
    },
    output: {
      path: resolve(opts.output),
    },
  };

  const config = mergeConfig(DEFAULT_CONFIG, profilePartial, {}, cliOverrides);
  validateConfig(config);

  const seconds = opts.seconds ? parseInt(opts.seconds) : 10;
  logger.info(`Preview: ${seconds}s at 720p 30fps`);

  await renderVideo({ config, previewSeconds: seconds });
}
