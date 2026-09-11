FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787
CMD ["npm", "start"]
