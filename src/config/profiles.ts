import type { RenderProfileName, PartialRenderConfig } from "../types.js";

type Profile = {
  output: {
    width: number;
    height: number;
    fps: number;
    videoBitrate: string;
  };
  particles: {
    count: number;
  };
};

const PROFILES: Record<RenderProfileName, Profile> = {
  preview: {
    output: {
      width: 1280,
      height: 720,
      fps: 30,
      videoBitrate: "6M",
    },
    particles: {
      count: 1200,
    },
  },
  standard: {
    output: {
      width: 1920,
      height: 1080,
      fps: 30,
      videoBitrate: "12M",
    },
    particles: {
      count: 2200,
    },
  },
  high: {
    output: {
      width: 1920,
      height: 1080,
      fps: 60,
      videoBitrate: "20M",
    },
    particles: {
      count: 3000,
    },
  },
  ultra: {
    output: {
      width: 3840,
      height: 2160,
      fps: 60,
      videoBitrate: "60M",
    },
    particles: {
      count: 5000,
    },
  },
};

export function getProfile(name: RenderProfileName): Profile {
  return PROFILES[name];
}

export function getProfilePartial(name: RenderProfileName): PartialRenderConfig {
  const p = PROFILES[name];
  return {
    output: { ...p.output, profile: name },
    particles: { ...p.particles },
  };
}
