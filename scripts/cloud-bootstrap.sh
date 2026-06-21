#!/bin/bash
# cloud-bootstrap.sh — runs on the vast.ai instance as part of the onstart
# chain. Installs Node.js 22, ffmpeg with nvenc (if missing), then runs
# npm ci + tsc + npm link.
#
# Invoked by the onstart script that the VastProvider generates when the
# user passes --git-url. This file lives in the logopulse repo so it travels
# with the code; the onstart just needs to clone the repo and run this.
set -euo pipefail

echo "[logopulse-bootstrap] starting at $(date -Iseconds)"

# --- Node.js 22 ---
if ! command -v node >/dev/null 2>&1; then
  echo "[logopulse-bootstrap] installing Node.js 22..."
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq --no-install-recommends nodejs
else
  echo "[logopulse-bootstrap] node $(node --version) already present"
fi

# --- ffmpeg with nvenc ---
# vastai/base-image ships ffmpeg but it may not have h264_nvenc. Check first
# and only download the static build if nvenc is missing.
if command -v ffmpeg >/dev/null 2>&1 && ffmpeg -encoders 2>/dev/null | grep -q h264_nvenc; then
  echo "[logopulse-bootstrap] ffmpeg with nvenc already present"
else
  echo "[logopulse-bootstrap] installing static ffmpeg with nvenc..."
  apt-get install -y -qq --no-install-recommends wget xz-utils
  cd /tmp
  wget -q https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz
  tar -xJf ffmpeg-master-latest-linux64-gpl.tar.xz
  install -m 0755 ffmpeg-master-latest-linux64-gpl/bin/ffmpeg /usr/local/bin/ffmpeg
  install -m 0755 ffmpeg-master-latest-linux64-gpl/bin/ffprobe /usr/local/bin/ffprobe
  rm -rf ffmpeg-master-latest-linux64-gpl ffmpeg-master-latest-linux64-gpl.tar.xz
fi
ffmpeg -version | head -1

# --- Build ---
echo "[logopulse-bootstrap] installing npm deps..."
npm ci --omit=dev

echo "[logopulse-bootstrap] building TypeScript..."
npx tsc

echo "[logopulse-bootstrap] linking logopulse to PATH..."
npm link

echo "[logopulse-bootstrap] done at $(date -Iseconds)"