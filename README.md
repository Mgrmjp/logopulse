# logopulse

Lightweight CLI tool for audio-reactive particle visualizer videos with static logos.

## Local render

```bash
npm install
npm run build
logopulse render --song song.mp3 --logo logo.png --background bg.jpg --output video.mp4
# or with a config file
logopulse render --config examples/visualizer.json
```

## Cloud render (vast.ai)

Render on a vast.ai GPU instance from your local machine. Blocking flow:
spawn instance → ship assets → render → download mp4 → destroy instance.

Two ways to provide the logopulse binary to the instance:

### Option A: Git URL bootstrap (no Docker publish)

The provider spawns a stock `vastai/base-image` instance and bootstraps
logopulse on it via `git clone`. No Docker image to build, no registry to
push to.

```bash
# 1. Push your code to a git host (one time)
git remote add origin https://github.com/USER/logopulse.git
git push -u origin main

# 2. Set your vast.ai key
export VAST_API_KEY=...

# 3. Submit
logopulse cloud submit --config examples/visualizer.json \
  --git-url https://github.com/USER/logopulse.git
```

What happens on the instance:
1. The vast.ai onstart script clones your repo to `/tmp/logopulse`
2. `scripts/cloud-bootstrap.sh` installs Node 22 (if missing) and ffmpeg
   with `h264_nvenc` (if missing), then runs `npm ci && tsc && npm link`
3. `scripts/cloud-run.sh` waits for the trigger file, then runs
   `logopulse worker --job ...`

Startup adds ~30–60s for the clone + npm install. The repo must contain
`scripts/cloud-bootstrap.sh` and `scripts/cloud-run.sh` (they're tracked
in this repo).

### Option B: Custom Docker image

If you already publish logopulse Docker images (Docker Hub, ghcr.io, etc.):

```bash
docker build -t yourname/logopulse:latest .
docker push yourname/logopulse:latest

logopulse cloud submit --config examples/visualizer.json \
  --cloud-image yourname/logopulse:latest
```

The image must have `logopulse` on PATH (the included `Dockerfile` does
this via `npm link`).

### Common flags

```bash
logopulse cloud submit --config examples/visualizer.json \
  --git-url https://github.com/USER/logopulse.git \
  --max-price 0.50 \          # abort if cheapest offer > $0.50/hr
  --disk 50 \                  # disk size in GB
  --output ./rendered.mp4 \    # local output path
  --poll-ms 10000              # status poll interval (ms)
```

The command blocks until the render completes, downloads the mp4, and
tears down the instance.

### How it works

The provider (`src/cloud/vast/provider.ts`):
1. Searches vast.ai for the cheapest `verified && rentable && !rented`
   on-demand GPU offer
2. Generates a fresh ed25519 keypair **in memory only** (never on disk)
3. Registers the public key on your vast.ai account
4. Spawns an instance with the chosen image, the SSH key, and an
   `onstart` script that waits for a trigger file
5. Polls the instance until `actual_status === "running"`
6. SCPs your song/logo/background + a rewritten job config to `/tmp/`
   on the instance, then touches the trigger file
7. The `logopulse worker` subcommand on the instance reads the job
   config, runs the render, and writes status updates to
   `/tmp/logopulse-status.json`
8. Your local CLI polls that status file every 10s
9. On completion, the mp4 is scp'd back and the instance is destroyed
   (`DELETE /instances/{id}/`)

The instance is **always destroyed** — on success, failure, Ctrl-C, or
any thrown error. The cleanup runs from a `finally` block.

### Cost

vast.ai's `dph` (dollars per hour) is the base rate; the actual bill
includes bandwidth and storage. The estimate printed before submission is
`dph × estimated_hours`. Use `--max-price` to abort if the cheapest offer
exceeds your cap.

### Design

- Private SSH keys are never written to disk.
- `VAST_API_KEY` is read from env, never from a file.
- No dependency on the vast.ai Python CLI; pure HTTP via Node's `fetch`.
- Cloud integration reuses the existing `CloudProvider` interface in
  `src/types.ts`; a `local-docker` provider can be added without changes
  to the interface.

## Development

```bash
npm run build       # compile TS to dist/
npm test            # run vitest suite
npm run lint        # tsc --noEmit
npm start -- render --config examples/visualizer.json  # dev render
```
