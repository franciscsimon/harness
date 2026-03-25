FROM node:22-slim

WORKDIR /app

# Install Docker CLI for CI pipeline activities
RUN apt-get update && apt-get install -y --no-install-recommends docker.io && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src/ src/

RUN npm run build

ENV NODE_ENV=production
CMD ["node", "dist/worker.js"]
