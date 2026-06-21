// vast.ai CloudProvider implementation.
//
// End-to-end flow for submitJob:
//   1. Search offers  →  pick the cheapest GPU offer
//   2. Generate ephemeral ed25519 keypair
//   3. Register the public key on the account  (POST /ssh/)
//   4. Create the instance from the chosen offer  (PUT /asks/{id}/)
//   5. Poll the instance until actual_status === "running"
//   6. Open SSH to (ssh_host, ssh_port) as root
//   7. SCP assets + rewritten job config to /tmp/ on the instance
//   8. Touch /tmp/logopulse-start so the onstart script kicks off the worker
//   9. Return CloudJob{ status: "running" }
//
// getStatus reads /tmp/logopulse-status.json over SSH. downloadResult
// scp's /tmp/logopulse-output.mp4 back and destroys the instance.
//
// destroy() is always called via try/finally from the CLI to guarantee the
// instance is reaped even on Ctrl-C, network failure, or worker crash.

import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AssetPaths,
  CloudJob,
  CloudProvider,
  CloudJobStatus,
  PartialRenderConfig,
} from "../../types.js";
import { loadConfig } from "../../config/load-config.js";
import { logger } from "../../utils/logger.js";
import { VastApi, type VastOffer, type VastInstance, sleep } from "./api.js";
import { connectSsh, generateEphemeralKey, type SshKeyPair, type SshClient } from "./ssh.js";
import { getExtension } from "../../utils/files.js";

const REMOTE_DIR = "/tmp";
const REMOTE_JOB = `${REMOTE_DIR}/logopulse-job.json`;
const REMOTE_STATUS = `${REMOTE_DIR}/logopulse-status.json`;
const REMOTE_OUTPUT = `${REMOTE_DIR}/logopulse-output.mp4`;
const REMOTE_START_TRIGGER = `${REMOTE_DIR}/logopulse-start`;

/** vast.ai's stock base image. Has nvidia drivers + container toolkit but
 *  not Node.js or git. We use this when --git-url is passed, so the
 *  onstart script clones the repo and bootstraps everything. */
export const DEFAULT_GIT_IMAGE = "vastai/base-image:cuda-12.6.3-auto";

// Default onstart script (waits for /tmp/logopulse-start, then runs the worker).
// The image is expected to have `logopulse` on PATH (set by the Dockerfile).
export const DEFAULT_ONSTART = [
  "set -e",
  "echo 'logopulse instance ready, waiting for job'",
  `while [ ! -f ${REMOTE_START_TRIGGER} ]; do sleep 1; done`,
  `logopulse worker --job ${REMOTE_JOB} --output ${REMOTE_OUTPUT} --status ${REMOTE_STATUS}`,
  `echo $? > ${REMOTE_DIR}/logopulse-exit`,
].join(" && ");

/**
 * Build the onstart script for the git-URL bootstrap flow. The image used
 * is `vastai/base-image` (which has nvidia drivers + container toolkit but
 * no Node.js or git). The onstart:
 *   1. Ensures git is present
 *   2. Clones the repo to /tmp/logopulse
 *   3. Runs scripts/cloud-bootstrap.sh (installs Node 22, ffmpeg with nvenc,
 *      runs npm ci + tsc + npm link)
 *   4. Runs scripts/cloud-run.sh (waits for /tmp/logopulse-start, then runs
 *      `logopulse worker`)
 *
 * Designed to fit within vast.ai's 4048-char onstart limit (currently ~600 chars).
 */
export function buildGitOnstart(gitUrl: string): string {
  const safeUrl = gitUrl.replace(/"/g, '\\"');
  return [
    "set -e",
    "echo '[logopulse-onstart] booting from git: " + safeUrl + "'",
    "command -v git >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq git)",
    "rm -rf /tmp/logopulse",
    `git clone --depth 1 "${safeUrl}" /tmp/logopulse`,
    "bash /tmp/logopulse/scripts/cloud-bootstrap.sh",
    "bash /tmp/logopulse/scripts/cloud-run.sh",
  ].join(" && ");
}

export type VastProviderOptions = {
  apiKey: string;
  image: string;
  diskGb?: number;
  /** Optional cap on per-hour cost. Aborts if cheapest offer exceeds this. */
  maxPricePerHour?: number;
  /** Override fetch for testing. */
  fetchImpl?: typeof fetch;
  /**
   * If set, the instance uses `vastai/base-image` and bootstraps logopulse
   * by cloning this git URL. Mutually exclusive with publishing a custom
   * Docker image — choose one or the other.
   */
  gitUrl?: string;
  /** Override the onstart script (advanced). */
  onstart?: string;
  /** Override SSH username. vast.ai uses "root" by default. */
  sshUsername?: string;
  /** Min reliability filter (0-1). Defaults to 0.9. */
  minReliability?: number;
  /** Comma-separated geolocation codes (e.g. "FR,DE,NL"). */
  geolocation?: string;
};

type JobState = {
  instanceId: number;
  sshHost: string;
  sshPort: number;
  key: SshKeyPair;
  offerDph: number;
};

export class VastProvider implements CloudProvider {
  private readonly api: VastApi;
  private readonly image: string;
  private readonly diskGb: number;
  private readonly maxPricePerHour: number | undefined;
  private readonly onstart: string;
  private readonly sshUsername: string;
  private readonly minReliability: number;
  private readonly geolocation: string | undefined;
  private readonly gitUrl: string | undefined;
  private readonly jobs = new Map<string, JobState>();

  constructor(opts: VastProviderOptions) {
    if (opts.gitUrl && opts.onstart) {
      throw new Error("VastProvider: gitUrl and onstart are mutually exclusive");
    }
    this.api = new VastApi({ apiKey: opts.apiKey, fetchImpl: opts.fetchImpl });
    // If gitUrl is provided, use the stock vastai/base-image + bootstrap
    // onstart instead of requiring a published custom image.
    this.gitUrl = opts.gitUrl;
    this.image = opts.gitUrl ? DEFAULT_GIT_IMAGE : opts.image;
    this.diskGb = opts.diskGb ?? 50;
    this.maxPricePerHour = opts.maxPricePerHour;
    this.onstart = opts.onstart ?? (opts.gitUrl ? buildGitOnstart(opts.gitUrl) : DEFAULT_ONSTART);
    this.sshUsername = opts.sshUsername ?? "root";
    this.minReliability = opts.minReliability ?? 0.9;
    this.geolocation = opts.geolocation;
  }

  /** Find the cheapest GPU offer that meets our filters. */
  async pickOffer(): Promise<VastOffer> {
    const offers = await this.api.searchOffers({
      type: "on-demand",
      verified: true,
      rentable: true,
      rented: false,
      numGpusGte: 1,
      minReliability: this.minReliability,
      geolocation: this.geolocation,
      order: "dph_total",
      limit: 20,
    });
    if (offers.length === 0) {
      throw new Error("No GPU offers available on vast.ai matching criteria");
    }
    const cheapest = offers[0];
    if (this.maxPricePerHour !== undefined && cheapest.dph_total > this.maxPricePerHour) {
      throw new Error(
        `Cheapest offer $${cheapest.dph_total.toFixed(3)}/hr exceeds max-price $${this.maxPricePerHour}/hr ` +
          `(gpu=${cheapest.gpu_name}, num=${cheapest.num_gpus})`
      );
    }
    return cheapest;
  }

  async submitJob(configPath: string, assets: AssetPaths): Promise<CloudJob> {
    // 1. pick offer
    const offer = await this.pickOffer();
    const estHours = 1;
    const estCost = offer.dph_total * estHours;
    logger.info(
      `Picked offer: ${offer.gpu_name} x${offer.num_gpus} @ $${offer.dph_total.toFixed(3)}/hr ` +
        `(estimate: $${estCost.toFixed(3)}/hr+). machine_id=${offer.machine_id}`
    );

    // 2. ephemeral keypair
    const key = generateEphemeralKey();
    logger.debug(`Generated ephemeral keypair (${key.fingerprint})`);

    // 3. register public key
    await this.api.registerSshKey(key.publicKeyOpenSsh);
    logger.debug("SSH key registered");

    // 4. rewrite config so input paths point at the remote /tmp files
    const localConfig = loadConfig(configPath);
    const remoteConfig = rewriteConfigForRemote(localConfig, assets);

    // 5. write rewritten config to a temp file locally so we can scp it
    const tmpConfigPath = join(tmpdir(), `logopulse-job-${Date.now()}.json`);
    await writeFile(tmpConfigPath, JSON.stringify(remoteConfig, null, 2), "utf8");

    let instanceId: number | undefined;
    try {
      // 6. create instance
      instanceId = await this.api.createInstance({
        offerId: offer.id,
        image: this.image,
        diskGb: this.diskGb,
        publicSshKey: key.publicKeyOpenSsh,
        onstart: this.onstart,
        label: "logopulse-render",
      });
      logger.info(`Instance ${instanceId} created, waiting for it to come up...`);

      // 7. wait for running
      const inst = await waitForInstanceRunning(this.api, instanceId, 10 * 60_000);
      if (!inst.ssh_host || !inst.ssh_port) {
        throw new Error(`Instance ${instanceId} running but has no ssh_host/port`);
      }

      // 8. open SSH and ship assets + job config
      // Retry SSH connection — the daemon may need a few seconds after
      // the instance reports "running".
      let ssh!: SshClient;
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          ssh = await connectSsh({
            host: inst.ssh_host,
            port: inst.ssh_port,
            username: this.sshUsername,
            privateKey: key.privateKeyPem,
          });
          break;
        } catch (err) {
          if (attempt === 10) throw err;
          logger.debug(`SSH attempt ${attempt}/10 failed, retrying in 5s...`);
          await sleep(5000);
        }
      }
      try {
        const ext = (p: string) => getExtension(p) || ".bin";
        await ssh.putFile(assets.song, `${REMOTE_DIR}/song${ext(assets.song)}`);
        await ssh.putFile(assets.logo, `${REMOTE_DIR}/logo${ext(assets.logo)}`);
        await ssh.putFile(assets.background, `${REMOTE_DIR}/background${ext(assets.background)}`);
        await ssh.putFile(tmpConfigPath, REMOTE_JOB);
        // 9. kick the worker
        await ssh.execCommand(`touch ${REMOTE_START_TRIGGER}`);
      } finally {
        await ssh.dispose();
      }

      this.jobs.set(String(instanceId), {
        instanceId,
        sshHost: inst.ssh_host,
        sshPort: inst.ssh_port,
        key,
        offerDph: offer.dph_total,
      });

      logger.info("Assets shipped, worker is running. Polling status...");
      return { id: String(instanceId), provider: "vast", status: "running" };
    } catch (err) {
      // cleanup on any failure during submitJob
      if (instanceId !== undefined) {
        logger.warn(`submitJob failed; destroying instance ${instanceId}`);
        try {
          await this.api.destroyInstance(instanceId);
        } catch (cleanupErr) {
          logger.warn(`Failed to destroy instance during cleanup: ${cleanupErr}`);
        }
      }
      throw err;
    } finally {
      // best-effort: remove the local rewritten-config file
      try {
        await unlink(tmpConfigPath);
      } catch {
        /* ignore */
      }
    }
  }

  async getStatus(jobId: string): Promise<CloudJobStatus> {
    const state = this.jobs.get(jobId);
    if (!state) throw new Error(`Unknown job: ${jobId}`);

    // Check the instance is still alive
    let inst: VastInstance;
    try {
      inst = await this.api.getInstance(state.instanceId);
    } catch (err) {
      logger.warn(`getInstance failed: ${err}`);
      return "failed";
    }
    if (
      inst.actual_status === "exited" ||
      inst.actual_status === "error" ||
      inst.actual_status === "offline" ||
      inst.actual_status === "unknown"
    ) {
      logger.warn(`Instance ${state.instanceId} is ${inst.actual_status}`);
      return "failed";
    }

    // Try to read the status file
    const ssh = await connectSsh({
      host: state.sshHost,
      port: state.sshPort,
      username: this.sshUsername,
      privateKey: state.key.privateKeyPem,
    });
    try {
      const { stdout, code } = await ssh.execCommand(
        `if [ -f ${REMOTE_STATUS} ]; then cat ${REMOTE_STATUS}; else echo '{}'; fi`
      );
      if (code !== 0) return "running";
      const trimmed = stdout.trim();
      if (!trimmed || trimmed === "{}") return "running";
      try {
        const parsed = JSON.parse(trimmed) as { status?: string; error?: string };
        if (parsed.status === "completed") return "completed";
        if (parsed.status === "failed") return "failed";
        return "running";
      } catch {
        return "running";
      }
    } finally {
      await ssh.dispose();
    }
  }

  async downloadResult(jobId: string, outputPath: string): Promise<void> {
    const state = this.jobs.get(jobId);
    if (!state) throw new Error(`Unknown job: ${jobId}`);

    const ssh = await connectSsh({
      host: state.sshHost,
      port: state.sshPort,
      username: this.sshUsername,
      privateKey: state.key.privateKeyPem,
    });
    try {
      await ssh.getFile(outputPath, REMOTE_OUTPUT);
    } finally {
      await ssh.dispose();
    }
    // Tear down the instance after we have the result
    await this.destroy(jobId);
  }

  async destroy(jobId: string): Promise<void> {
    const state = this.jobs.get(jobId);
    if (!state) return;
    try {
      await this.api.destroyInstance(state.instanceId);
      logger.info(`Instance ${state.instanceId} destroyed`);
    } catch (err) {
      logger.warn(`Failed to destroy instance ${state.instanceId}: ${err}`);
    } finally {
      this.jobs.delete(jobId);
    }
  }
}

/**
 * Rewrite input paths in a config to point at the remote /tmp locations where
 * the assets are SCP'd to. The worker reads `/tmp/logopulse-job.json` and
 * runs the render against these paths.
 */
export function rewriteConfigForRemote(
  config: PartialRenderConfig,
  assets: AssetPaths
): PartialRenderConfig {
  const ext = (p: string) => getExtension(p) || ".bin";
  return {
    ...config,
    input: {
      ...config.input,
      song: `${REMOTE_DIR}/song${ext(assets.song)}`,
      logo: `${REMOTE_DIR}/logo${ext(assets.logo)}`,
      background: `${REMOTE_DIR}/background${ext(assets.background)}`,
    },
  };
}

// Re-export so tests can stub
export { sleep };

/** Poll the instance until it reaches "running" status or times out. */
export async function waitForInstanceRunning(
  api: VastApi,
  instanceId: number,
  timeoutMs: number
): Promise<VastInstance> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "unknown";
  while (Date.now() < deadline) {
    const inst = await api.getInstance(instanceId);
    const newStatus = inst.actual_status;
    if (newStatus !== lastStatus) {
      logger.info(`Instance ${instanceId}: ${newStatus}`);
      lastStatus = newStatus;
    }
    if (lastStatus === "running") return inst;
    if (
      lastStatus === "exited" ||
      lastStatus === "error" ||
      lastStatus === "offline" ||
      lastStatus === "unknown"
    ) {
      throw new Error(
        `Instance ${instanceId} died during boot: actual_status=${lastStatus}, ` +
          `status_msg=${inst.status_msg ?? "(none)"}`
      );
    }
    await sleep(3000);
  }
  throw new Error(
    `Instance ${instanceId} did not become ready within ${timeoutMs}ms (last status: ${lastStatus})`
  );
}
