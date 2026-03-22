// ─── Docker Event → JSON-LD Transform ─────────────────────────
// Converts raw Docker API events into JSON-LD documents for XTDB storage.

export interface DockerRawEvent {
  Type: string;
  Action: string;
  Actor: {
    ID: string;
    Attributes: Record<string, string>;
  };
  scope: string;
  time: number;
  timeNano: number;
}

export interface DockerEventRecord {
  _id: string;
  event_type: string;
  action: string;
  container_id: string;
  container_name: string;
  service_name: string;
  compose_project: string;
  image: string;
  exit_code: number | null;
  severity: string;
  attributes: string;
  ts: number;
  ts_nano: number;
  jsonld: string;
}

/** Classify event severity */
function classifySeverity(action: string, attrs: Record<string, string>): string {
  if (action === "oom") return "critical";
  if (action === "die") {
    const code = attrs.exitCode ?? attrs.exitcode;
    return code && code !== "0" ? "error" : "info";
  }
  if (action === "kill") return "warning";
  if (action.startsWith("health_status")) {
    return action.includes("unhealthy") ? "warning" : "info";
  }
  if (action === "restart") return "warning";
  // Normal lifecycle
  return "info";
}

/** Transform raw Docker event to XTDB record + JSON-LD */
export function transformEvent(raw: DockerRawEvent): DockerEventRecord {
  const attrs = raw.Actor?.Attributes ?? {};
  const containerId = raw.Actor?.ID ?? "";
  const containerName = attrs.name ?? "";
  const serviceName = attrs["com.docker.compose.service"] ?? "";
  const composeProject = attrs["com.docker.compose.project"] ?? "";
  const image = attrs.image ?? "";
  const action = raw.Action ?? "";
  const severity = classifySeverity(action, attrs);
  const tsMs = raw.time * 1000;
  const shortId = containerId.slice(0, 12);
  const _id = `docker:evt:${raw.timeNano}-${shortId}`;

  const exitCodeStr = attrs.exitCode ?? attrs.exitcode;
  const exitCode = exitCodeStr != null ? parseInt(exitCodeStr, 10) : null;

  const jsonld = JSON.stringify({
    "@context": {
      schema: "https://schema.org/",
      code: "https://pi.dev/code/",
      docker: "https://pi.dev/docker/",
    },
    "@type": "docker:ContainerEvent",
    "@id": _id,
    "schema:name": `${raw.Type}.${action}`,
    "docker:eventType": raw.Type,
    "docker:action": action,
    "docker:containerId": containerId,
    "docker:containerName": containerName,
    "docker:serviceName": serviceName,
    "docker:composeProject": composeProject,
    "docker:image": image,
    ...(exitCode != null ? { "docker:exitCode": exitCode } : {}),
    "docker:severity": severity,
    "schema:dateCreated": new Date(tsMs).toISOString(),
    "code:timestamp": tsMs,
  });

  return {
    _id,
    event_type: raw.Type,
    action,
    container_id: containerId,
    container_name: containerName,
    service_name: serviceName,
    compose_project: composeProject,
    image,
    exit_code: exitCode,
    severity,
    attributes: JSON.stringify(attrs),
    ts: tsMs,
    ts_nano: raw.timeNano,
    jsonld,
  };
}
