#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

const program = new Command();

program
  .name("logopulse")
  .description("Audio-reactive particle visualizer with static logo")
  .version(pkg.version);

program
  .command("render")
  .description("Render a visualizer video")
  .requiredOption("--song <path>", "Path to audio file (mp3/wav/flac)")
  .requiredOption("--logo <path>", "Path to logo image (png/jpg/svg)")
  .requiredOption("--background <path>", "Path to background image (jpg/png/webp)")
  .requiredOption("--output <path>", "Output video path (mp4)")
  .option("--config <path>", "Path to JSON config file")
  .option("--profile <name>", "Render profile (preview/standard/high/ultra)", "ultra")
  .option("--width <number>", "Output width", parseInt)
  .option("--height <number>", "Output height", parseInt)
  .option("--fps <number>", "Frames per second", parseInt)
  .option("--video-bitrate <rate>", "Video bitrate (e.g. 60M)")
  .option("--audio-bitrate <rate>", "Audio bitrate (e.g. 320k)")
  .option("--particles <number>", "Particle count", parseInt)
  .option("--logo-size <number>", "Logo size in pixels", parseInt)
  .option("--darken <number>", "Background darken amount (0-1)", parseFloat)
  .option("--blur <number>", "Background blur radius", parseFloat)
  .option("--vignette <number>", "Vignette strength (0-1)", parseFloat)
  .option("--gpu", "Enable GPU encoding if available")
  .option("--temp-dir <path>", "Temporary directory")
  .option("--debug", "Enable debug output")
  .option("--keep-frames", "Keep rendered frames after encoding")
  .action(async (opts) => {
    const { renderCommand } = await import("./commands/render.js");
    await renderCommand(opts);
  });

program
  .command("preview")
  .description("Render a short preview clip")
  .requiredOption("--song <path>", "Path to audio file")
  .requiredOption("--logo <path>", "Path to logo image")
  .requiredOption("--background <path>", "Path to background image")
  .requiredOption("--output <path>", "Output video path")
  .option("--seconds <number>", "Duration in seconds", parseInt, 10)
  .option("--debug", "Enable debug output")
  .action(async (opts) => {
    const { previewCommand } = await import("./commands/preview.js");
    await previewCommand(opts);
  });

program
  .command("analyze")
  .description("Analyze audio file and output frame data")
  .requiredOption("--song <path>", "Path to audio file")
  .option("--fps <number>", "Analysis frame rate", parseInt, 60)
  .option("--output <path>", "Output JSON path")
  .action(async (opts) => {
    const { analyzeCommand } = await import("./commands/analyze.js");
    await analyzeCommand(opts);
  });

program
  .command("cloud")
  .description("Cloud rendering commands")
  .command("submit")
  .description("Submit a cloud render job (blocking, downloads result on completion)")
  .requiredOption("--config <path>", "Path to JSON config file")
  .option("--cloud-image <image>", "Docker image to run on the instance (must be built and pushed first)")
  .option("--git-url <url>", "Bootstrap from a git URL on vastai/base-image instead of using --cloud-image (no Docker publish needed)")
  .option("--max-price <usd>", "Max per-hour price; abort if cheapest offer exceeds", parseFloat)
  .option("--gpu <names>", "Comma-separated GPU names to filter (e.g. 'RTX 5070 Ti,RTX 4070')")
  .option("--disk <gb>", "Disk size in GB (default 50)", parseInt)
  .option("--output <path>", "Local output path (default: <config-dir>/output.mp4)")
  .option("--geolocation <codes>", "Comma-separated country codes to prefer (e.g. FR,DE,NL)")
  .option("--poll-ms <ms>", "Status poll interval in ms", parseInt)
  .action(async (opts) => {
    const { cloudSubmitCommand } = await import("./commands/cloud-submit.js");
    await cloudSubmitCommand(opts);
  });

program
  .command("worker")
  .description("Internal: runs on the cloud instance, executes the render")
  .requiredOption("--job <path>", "Path to the job config JSON")
  .requiredOption("--output <path>", "Where to write the rendered mp4")
  .requiredOption("--status <path>", "Where to write status JSON")
  .action(async (opts) => {
    const { workerCommand } = await import("./commands/worker.js");
    await workerCommand(opts);
  });

program.parse();
