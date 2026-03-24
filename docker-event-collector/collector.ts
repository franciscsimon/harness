// ─── Docker Event Stream Collector ────────────────────────────
// Connects to Docker socket, streams ALL events, transforms and writes to XTDB.
// Reconnects with backfill on disconnect.

import * as http from "node:http";
import { checkAlerts } from "./alerting.ts";
import { type DockerRawEvent, transformEvent } from "./transform.ts";
import { enqueueEvent } from "./writer.ts";

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const RECONNECT_DELAY_MS = 5000;

let lastSeenTimestamp = 0; // Unix seconds — for backfill on reconnect
let totalReceived = 0;
let isConnected = false;
let reconnectCount = 0;

export function getCollectorStats() {
  return { totalReceived, isConnected, reconnectCount, lastSeenTimestamp };
}

export function startCollector() {
  connect();
}

function connect() {
  const since = lastSeenTimestamp > 0 ? `?since=${lastSeenTimestamp}` : "";
  const path = `/v1.46/events${since}`;

  const req = http.request(
    {
      socketPath: DOCKER_SOCKET,
      path,
      method: "GET",
      headers: { Accept: "application/json" },
    },
    (res) => {
      if (res.statusCode !== 200) {
        scheduleReconnect();
        return;
      }

      isConnected = true;

      let partial = "";

      res.on("data", (chunk: Buffer) => {
        partial += chunk.toString();
        const lines = partial.split("\n");
        // Keep last partial line (might be incomplete)
        partial = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const raw: DockerRawEvent = JSON.parse(line);
            totalReceived++;
            lastSeenTimestamp = raw.time;
            const record = transformEvent(raw);
            enqueueEvent(record);
            checkAlerts(record);
          } catch (e: unknown) {
            const _msg = e instanceof Error ? e.message : String(e);
          }
        }
      });

      res.on("end", () => {
        isConnected = false;
        scheduleReconnect();
      });

      res.on("error", (_e) => {
        isConnected = false;
        scheduleReconnect();
      });
    },
  );

  req.on("error", (_e) => {
    isConnected = false;
    scheduleReconnect();
  });

  req.end();
}

function scheduleReconnect() {
  reconnectCount++;
  setTimeout(connect, RECONNECT_DELAY_MS);
}

export function stopCollector() {
  isConnected = false;
}
