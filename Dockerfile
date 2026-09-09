FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ENV VITE_BRIDGE_LOCAL_PREVIEW=false
RUN npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv fonts-liberation ca-certificates tini build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/requirements.txt ./
RUN python3 -m venv /opt/bridge-python && /opt/bridge-python/bin/pip install --no-cache-dir -r requirements.txt
COPY backend/src/ ./src/
COPY backend/scripts/ ./scripts/
COPY --from=frontend /app/frontend/dist/ /app/frontend/dist/
RUN mkdir -p /data/model-cache && chown -R node:node /data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 BRIDGE_DATA_DIR=/data BRIDGE_SERVE_FRONTEND=true PYTHON_BIN=/opt/bridge-python/bin/python HF_HOME=/data/model-cache
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["node", "src/server.js"]
