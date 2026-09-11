FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ffmpeg python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY requirements.txt ./
RUN python3 -m pip install --no-cache-dir --break-system-packages -r requirements.txt

COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=8787
ENV PYTHON_BIN=python3

EXPOSE 8787
CMD ["npm", "start"]
