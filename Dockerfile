# GPU-capable logopulse image.
#
# Base: nvidia/cuda runtime — provides NVIDIA driver userspace + the container
# toolkit so h264_nvenc can talk to the host GPU. On vast.ai GPU offers, the
# host has the driver installed and the container is launched with --gpus all
# automatically; you just need the toolkit inside the image.
#
# ffmpeg: the Ubuntu apt ffmpeg is built without --enable-nvenc, so we drop
# in BtbN's GPL static build which has nvenc + most other codecs.
# Source: https://github.com/BtbN/FFmpeg-Builds/releases (GPL build, ~80MB)

FROM nvidia/cuda:12.6.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=22

# System deps
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      xz-utils \
      python3 \
      make \
      g++ \
      libcairo2-dev \
      libjpeg-dev \
      libpango1.0-dev \
      libgif-dev \
      librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 (NodeSource)
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Static ffmpeg with nvenc
ARG FFMPEG_URL=https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz
RUN cd /tmp && \
    curl -fsSL "${FFMPEG_URL}" -o ffmpeg.tar.xz && \
    tar -xJf ffmpeg.tar.xz && \
    mv ffmpeg-master-latest-linux64-gpl/bin/ffmpeg /usr/local/bin/ffmpeg && \
    mv ffmpeg-master-latest-linux64-gpl/bin/ffprobe /usr/local/bin/ffprobe && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe && \
    rm -rf ffmpeg.tar.xz ffmpeg-master-latest-linux64-gpl && \
    ffmpeg -version | head -1

# Verify nvenc is present
RUN ffmpeg -encoders 2>/dev/null | grep -q h264_nvenc || \
    (echo "ERROR: ffmpeg build is missing h264_nvenc" && exit 1)

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build \
  && npm prune --omit=dev \
  && npm link

ENV PATH="/app/node_modules/.bin:${PATH}"

ENTRYPOINT ["node", "dist/cli.js"]
