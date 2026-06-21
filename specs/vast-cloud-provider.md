# Spec: vast.ai Cloud Rendering Provider

Status: DRAFT (awaiting review)
Target version: 0.2.0

## Objective

Add a `vast` provider to logopulse so users can render videos on vast.ai
GPU instances without leaving the CLI. The user runs `logopulse cloud submit`
on their local machine, the tool spins up a fresh on-demand vast.ai instance,
ships the song + logo + background + render config up to it, runs the
existing renderer there, downloads the finished mp4, and tears the instance
down. Total wall time is dominated by the actual render.

**User story:**

> As a logopulse user, I want to run `logopulse cloud submit --config my.json`
> from my laptop, walk away, and find a finished `output.mp4` next to my
> config — without manually provisioning vast.ai instances, SSHing in, or
> wrangling Docker.

**Success criteria** (specific, testable):

- `logopulse cloud submit --config examples/visualizer.json` produces a
  playable `output.mp4` in the current directory that is byte-identical (or
  functionally identical — same ffprobe-reported duration, resolution, fps)
  to what `logopulse render` would produce locally with the same config.
- The vast.ai instance is destroyed (status: `deleted`) within 60 seconds of
  the job finishing, success or failure.
- No secrets are written to disk. The ephemeral SSH keypair lives in memory
  only and is discarded on process exit.
- A job that fails inside the instance (non-zero exit, status file reports
  `failed`) is reported back to the user with a non-zero exit code and the
  last 50 lines of the render log.
- Estimated instance cost (USD/hour × estimated render time) is printed
  before the user is charged. The job only proceeds after a `--yes` flag (or
  a 5-second countdown with `Ctrl-C` escape in v1.0; v0.2 will simply print
  the estimate and proceed).
- All HTTP calls to `cloud.vast.ai` use the Authorization header from
  `VAST_API_KEY` env var. Missing key → clear error, exit 2.

## Tech Stack

- TypeScript 6.0 (existing)
- Node 22 (existing)
- New runtime dependency: `node-ssh` (scp + ssh exec) — pulls in `ssh2`
- New runtime dependency: nothing else; HTTP via global `fetch` (Node 22)
- Existing `commander` 15.0 for CLI
- Existing `vitest` 4.1 for tests
- `cloud.vast.ai` REST API v0 (no Python CLI dependency)

## Commands

```bash
# Build (existing)
npm run build

# Render locally (existing)
npm start -- render --config examples/visualizer.json

# Render on vast.ai (new, blocking)
export VAST_API_KEY=...      # from vast.ai account settings
npm start -- cloud submit --config examples/visualizer.json
npm start -- cloud submit --config examples/visualizer.json --yes
npm start -- cloud submit --config examples/visualizer.json \
  --cloud-image logopulse/logopulse:0.2.0 \
  --disk 50 \
  --max-price 0.50

# New worker command (runs on the vast.ai instance, not user-facing)
logopulse worker --job /tmp/logopulse-job.json \
                 --output /tmp/logopulse-output.mp4 \
                 --status /tmp/logopulse-status.json
```

## Project Structure

```
src/
  cloud/
    provider.ts          # NEW: CloudProvider interface (move from types.ts) + factory
    vast/
      api.ts             # NEW: typed wrapper around cloud.vast.ai/api/v0/
      instance.ts        # NEW: instance lifecycle (create/wait/ssh/destroy)
      ssh.ts             # NEW: ephemeral keypair + node-ssh wrapper
      provider.ts        # NEW: implements CloudProvider, orchestrates everything
      index.ts           # NEW: re-exports
    local.ts             # NEW: stub for "local docker" provider (sibling to vast)
  commands/
    cloud-submit.ts      # NEW: replaces stub in cli.ts
    cloud-status.ts      # NEW: stub for now (async job mode comes in 0.3)
    cloud-download.ts    # NEW: stub for now
    worker.ts            # NEW: runs on the instance
  cli.ts                 # CHANGED: wire real cloud-submit command
  types.ts               # CHANGED: CloudProvider interface moves to cloud/provider.ts,
                         #         re-exported for back-compat
specs/
  vast-cloud-provider.md # this file
tests/
  cloud/
    vast-api.test.ts     # NEW: API request shape, mocked fetch
    vast-provider.test.ts # NEW: end-to-end with fake fetch + fake ssh
    worker.test.ts       # NEW: status.json contract
Dockerfile               # CHANGED: `npm link` so `logopulse` is on PATH
```

## Code Style

- ESM modules, `type: "module"` (existing)
- Top-level `import` only (existing)
- One symbol per file where practical; barrel `index.ts` re-exports
- Errors are `class VastApiError extends Error` with `status`, `endpoint`, `body`
- All public functions have explicit return types (existing `tsc --noEmit` enforces)
- Logger via `import { logger } from "../utils/logger.js"` (existing)
- HTTP via `fetch`, wrapped in a `vastRequest<T>(method, path, body)` helper that:
  - sets `Authorization: Bearer ${VAST_API_KEY}`
  - throws `VastApiError` on non-2xx
  - returns `await res.json() as T`
- Style example (status polling):

```ts
export async function waitForRunning(
  instanceId: number,
  api: VastApi,
  opts: { timeoutMs: number; pollMs: number }
): Promise<VastInstance> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const inst = await api.getInstance(instanceId);
    if (inst.actual_status === "running") return inst;
    if (inst.actual_status === "exited" || inst.actual_status === "error")
      throw new VastApiError(500, "instance died", inst);
    await sleep(opts.pollMs);
  }
  throw new VastApiError(504, "instance did not become ready", { instanceId });
}
```

## Testing Strategy

- **Unit tests** (vitest, `tests/cloud/`): mock `fetch` and `node-ssh`. Cover
  happy path, API error mapping, SSH failure, instance-died-during-render,
  download failure, key cleanup.
- **Contract test for `worker`**: spawn the worker in a subprocess against a
  1-second synthetic render fixture; assert the status file lifecycle
  (`running` → `completed` with progress monotonically increasing).
- **Integration test** (manual, documented, not in CI): run a real
  `cloud submit` against vast.ai with the cheapest offer. Cost ~$0.01.
  Gated behind `RUN_VAST_INTEGRATION=1` so CI never hits the real API.
- **No live vast.ai calls in CI.** Tests must pass without `VAST_API_KEY`.
- Coverage target: 80% lines on `src/cloud/vast/*.ts`.

## Boundaries

**Always do:**

- Read `VAST_API_KEY` from env; error clearly if missing.
- Generate a fresh `crypto.generateKeyPairSync("ed25519")` per job; never
  persist the private key to disk.
- Destroy the vast.ai instance on every exit path (success, render error,
  Ctrl-C, network failure). Use `try/finally`.
- Print the cost estimate (offer.dph × estimated_hours) before creating the
  instance. If `--max-price` is set and the offer exceeds it, abort.
- Surface the last 50 lines of the worker's stdout/stderr on failure.

**Ask first:**

- Changing the Docker base image to a non-Node image.
- Adding a new runtime dependency beyond `node-ssh`.
- Bumping the vast.ai API version.
- Making the provider multi-job / queue-based (out of scope for 0.2).

**Never do:**

- Write the SSH private key to disk. Not even temporarily.
- Add a `vastai` Python CLI dependency.
- Cache `VAST_API_KEY` in any file.
- Bypass `--max-price` checks.
- Leave a vast.ai instance running on exit under any circumstance.

## Open Questions (need human confirmation)

1. **GPU interpretation:** When you picked "always gpu" for the GPU
   question, did you mean (a) "cloud jobs *always* pick a GPU instance
   regardless of `--gpu`", or (b) "the default is GPU, but `--no-gpu` is
   allowed and selects CPU"? Current spec assumes (a) — `cloud submit`
   ignores `runtime.useGpu` and always picks the cheapest GPU offer. If
   you meant (b), say so and I'll add the toggle.

2. **Worker image hosting:** The spec assumes a published
   `logopulse/logopulse:0.2.0` Docker Hub image. v0.2 ships without a
   publish step. Two options:
   - **(A)** Document that the user must build + push the image first
     (`docker build -t logopulse/logopulse:0.2.0 . && docker push …`).
     This is the only way that works without CI/CD.
   - **(B)** Have the onstart script bootstrap from the GitHub repo:
     `git clone https://github.com/<org>/logopulse /app && cd /app && npm ci && npm run build && …`. Requires git + network on the instance, adds ~30s overhead, no publish step.
   Spec is written for (A). Switch to (B) if you don't want to publish.

3. **Cost estimate accuracy:** vast.ai's `dph` (dollars per hour) is the
   *base* hourly rate; actual cost includes bandwidth and storage. The
   estimate printed before submission will be an under-estimate. Is
   showing only `dph × estimated_hours` acceptable for v1, or should we
   add a 1.5× safety multiplier in the printed estimate?

4. **Long renders:** vast.ai instances can be interrupted if the host
   machine goes down. v1 spec has no resume support. Acceptable, or do
   we need a `cloud submit --resume <job-id>` for v0.2?
