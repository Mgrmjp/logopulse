#!/bin/bash
# cloud-run.sh — runs on the vast.ai instance after cloud-bootstrap.sh.
# Waits for the provider to ship + trigger the job, then runs the worker.
set -euo pipefail

REMOTE_JOB="${LOGOPULSE_JOB:-/tmp/logopulse-job.json}"
REMOTE_OUTPUT="${LOGOPULSE_OUTPUT:-/tmp/logopulse-output.mp4}"
REMOTE_STATUS="${LOGOPULSE_STATUS:-/tmp/logopulse-status.json}"
REMOTE_START="${LOGOPULSE_START:-/tmp/logopulse-start}"

echo "[logopulse-run] waiting for trigger at ${REMOTE_START}..."
while [ ! -f "${REMOTE_START}" ]; do
  sleep 1
done

echo "[logopulse-run] starting worker"
logopulse worker \
  --job "${REMOTE_JOB}" \
  --output "${REMOTE_OUTPUT}" \
  --status "${REMOTE_STATUS}"

echo "[logopulse-run] worker exited with code $?"