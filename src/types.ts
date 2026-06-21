export type RenderProfileName =
  | "preview"
  | "standard"
  | "high"
  | "ultra";

export type RenderConfig = {
  input: InputConfig;
  output: OutputConfig;
  scene: SceneConfig;
  logo: LogoConfig;
  particles: ParticleConfig;
  audioReactivity: AudioReactivityConfig;
  runtime: RuntimeConfig;
};

export type InputConfig = {
  song: string;
  logo: string;
  background: string;
};

export type OutputConfig = {
  path: string;
  profile: RenderProfileName;
  width: number;
  height: number;
  fps: number;
  format: "mp4";
  videoCodec: "h264";
  audioCodec: "aac";
  videoBitrate: string;
  audioBitrate: string;
  pixelFormat: "yuv420p";
};

export type SceneConfig = {
  preset: string;
  backgroundBlur: number;
  backgroundDarken: number;
  vignette: number;
  cameraMovement: false;
};

export type LogoConfig = {
  static: true;
  position: "center";
  size: number;
  safeRadius: number;
  shadow: boolean;
  shadowOpacity: number;
};

export type ParticleConfig = {
  count: number;
  size: number;
  speed: number;
  innerRadius: number;
  outerRadius: number;
  bassExpansion: number;
  beatBurst: boolean;
  beatBurstParticles: number;
  avoidLogoArea: boolean;
  foregroundSparkles: boolean;
};

export type AudioReactivityConfig = {
  volume: number;
  bass: number;
  mids: number;
  highs: number;
  beat: number;
  smoothing: number;
};

export type RuntimeConfig = {
  mode: "local" | "cloud";
  cloudProvider: null | "runpod" | "paperspace" | "vast" | "ssh";
  useGpu: boolean;
  tempDir: string;
  streamFramesToFfmpeg: boolean;
  keepFrames: boolean;
  debug: boolean;
};

export type AudioFrame = {
  frame: number;
  time: number;
  volume: number;
  bass: number;
  mids: number;
  highs: number;
  beat: number;
  energy: number;
};

export type Particle = {
  id: number;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  angle: number;
  radius: number;
  baseRadius: number;
  speed: number;
  size: number;
  opacity: number;
  life: number;
  color: string;
  velocityX: number;
  velocityY: number;
  layer: "background" | "main" | "burst" | "foreground";
  seed: number;
};

export type AudioMetadata = {
  duration: number;
  sampleRate: number;
  channels: number;
  bitrate: number;
};

export type CloudProvider = {
  submitJob(configPath: string, assets: AssetPaths): Promise<CloudJob>;
  getStatus(jobId: string): Promise<CloudJobStatus>;
  downloadResult(jobId: string, outputPath: string): Promise<void>;
  destroy(jobId: string): Promise<void>;
};

export type AssetPaths = {
  song: string;
  logo: string;
  background: string;
};

export type CloudJob = {
  id: string;
  provider: string;
  status: CloudJobStatus;
  outputUrl?: string;
};

export type CloudJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type RenderReport = {
  output: string;
  profile: RenderProfileName;
  width: number;
  height: number;
  fps: number;
  duration: number;
  particles: number;
  renderMode: "local" | "cloud";
  success: boolean;
  renderDuration?: number;
  error?: string;
};

export type AudioAnalysisResult = {
  song: string;
  duration: number;
  fps: number;
  sampleRate: number;
  frames: AudioFrame[];
};

export type PartialRenderConfig = Partial<{
  input: Partial<InputConfig>;
  output: Partial<OutputConfig>;
  scene: Partial<SceneConfig>;
  logo: Partial<LogoConfig>;
  particles: Partial<ParticleConfig>;
  audioReactivity: Partial<AudioReactivityConfig>;
  runtime: Partial<RuntimeConfig>;
}>;
