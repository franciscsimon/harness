// ─── Docker Event Stream Collector ────────────────────────────
// Connects to Docker socket, streams ALL events, transforms and writes to XTDB.
// Reconnects with backfill on disconnect.

import * as http from "node:http";
import { transformEvent, type DockerRawEvent } from "./transform.ts";
import { enqueueEvent } from "./writer.ts";
import { checkAlerts } from "./alerting.ts";

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

  console.log(`[collector] Connecting to Docker socket: ${DOCKER_SOCKET} ${since ? `(backfill from ${since})` : "(live)"}`);

  const req = http.request(
    {
      socketPath: DOCKER_SOCKET,
      path,
      method: "GET",
      headers: { Accept: "application/json" },
    },
    (res) => {
      if (res.statusCode !== 200) {
        console.error(`[collector] Docker API returned ${res.statusCode}`);
        scheduleReconnect();
        return;
      }

      isConnected = true;
      console.log(`[collector] Connected — streaming events`);

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
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[collector] Parse error: ${msg}`);
          }
        }
      });

      res.on("end", () => {
        console.log("[collector] Stream ended");
        isConnected = false;
        scheduleReconnect();
      });

      res.on("error", (e) => {
        console.error(`[collector] Stream error: ${e.message}`);
        isConnected = false;
        scheduleReconnect();
      });
    }
  );

  req.on("error", (e) => {
    console.error(`[collector] Connection error: ${e.message}`);
    isConnected = false;
    scheduleReconnect();
  });

  req.end();
}

function scheduleReconnect() {
  reconnectCount++;
  console.log(`[collector] Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt #${reconnectCount})`);
  setTimeout(connect, RECONNECT_DELAY_MS);
}

export function stopCollector() {
  isConnected = false;
  console.log(`[collector] Stopped. Total received: ${totalReceived}`);
}
