FROM oven/bun:latest
WORKDIR /app
COPY lib/ ./lib/
COPY health-prober/ ./health-prober/
COPY .cd.jsonld .
RUN cd health-prober && bun install
CMD ["bun", "run", "health-prober/index.ts"]
