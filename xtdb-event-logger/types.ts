import type { Quad } from "n3";

// ─── Schema Version ────────────────────────────────────────────────
// Bump when any handler's extraction logic changes.
export const SCHEMA_VERSION = 1;

// ─── Event Categories ──────────────────────────────────────────────

export type EventCategory =
  | "session"
  | "compaction"
  | "agent"
  | "message"
  | "tool"
  | "input"
  | "model"
  | "resource";

// ─── Event-Specific Fields ─────────────────────────────────────────
// Sparse: each handler populates only its own fields.
// All fields optional. Null means "not applicable for this event".

export interface EventFields {
  // Session
  switchReason?: string | null;
  switchTarget?: string | null;
  switchPrevious?: string | null;
  forkEntryId?: string | null;
  forkPrevious?: string | null;
  treeNewLeaf?: string | null;
  treeOldLeaf?: string | null;
  treeFromExt?: boolean | null;
  eventCwd?: string | null; // session_directory's own cwd (distinct from meta.cwd)

  // Compaction
  compactTokens?: number | null;
  compactFromExt?: boolean | null;

  // Agent
  promptText?: string | null;
  agentEndMsgCount?: number | null;
  turnIndex?: number | null;
  turnTimestamp?: number | null;
  turnEndToolCount?: number | null;

  // Message
  messageRole?: string | null;
  streamDeltaType?: string | null;
  streamDeltaLen?: number | null;

  // Tool
  toolName?: string | null;
  toolCallId?: string | null;
  isError?: boolean | null;
  contextMsgCount?: number | null;
  providerPayloadBytes?: number | null;

  // Input
  inputText?: string | null;
  inputSource?: string | null;
  inputHasImages?: boolean | null;
  bashCommand?: string | null;
  bashExclude?: boolean | null;

  // Model
  modelProvider?: string | null;
  modelId?: string | null;
  modelSource?: string | null;
  prevModelProvider?: string | null;
  prevModelId?: string | null;

  // Generic
  payload?: string | null;

  // Error capture (10.6 — handler crashed, still write a row)
  handlerError?: string | null;
}

// ─── Normalized Event Record ───────────────────────────────────────
// The single structured output every handler produces (via the router).
// This is what endpoints consume.

export interface NormalizedEvent {
  id: string; // UUIDv4
  eventName: string; // verbatim pi event name
  category: EventCategory;
  canIntercept: boolean;
  schemaVersion: number;
  ts: number; // Date.now() at capture
  seq: number; // monotonic counter within session
  sessionId: string | null;
  cwd: string | null;
  fields: EventFields;
}

// ─── Handler Function Signature ────────────────────────────────────
// Every per-event handler has this shape.
// It receives the raw pi event (unknown — handler casts and validates)
// and pre-extracted meta. Returns event-specific fields only.
// The router wraps fields into a full NormalizedEvent.

export type EventHandler = (event: unknown, meta: EventMeta) => EventFields;

// ─── Event Meta ────────────────────────────────────────────────────
// Context info extracted from the pi ExtensionContext before calling the handler.

export interface EventMeta {
  sessionId: string | null;
  cwd: string | null;
  seq: number;
}

// ─── Endpoint Interface ────────────────────────────────────────────
// A sink that receives normalized events + their JSON-LD representation.
// At least one must succeed init() or the extension refuses to start.

export interface Endpoint {
  readonly name: string;
  init(config: ResolvedConfig): Promise<void>;
  emit(event: NormalizedEvent, jsonld: string): void; // fire-and-forget
  flush(): Promise<void>;
  close(): Promise<void>;
}

// ─── Configuration ─────────────────────────────────────────────────

export interface XtdbEndpointConfig {
  enabled: boolean;
  host: string;
  port: number;
}

export interface JsonlEndpointConfig {
  enabled: boolean;
  path: string;
}

export interface ConsoleEndpointConfig {
  enabled: boolean;
}

export interface SamplingConfig {
  intervalMs: number;
}

export interface FlushConfig {
  intervalMs: number;
  batchSize: number;
}

export interface ResolvedConfig {
  endpoints: {
    xtdb: XtdbEndpointConfig;
    jsonl: JsonlEndpointConfig;
    console: ConsoleEndpointConfig;
  };
  sampling: SamplingConfig;
  flush: FlushConfig;
}

// ─── Environment Metadata ──────────────────────────────────────────

export interface EnvironmentMeta {
  piVersion: string;
  os: string;
  arch: string;
  nodeVersion: string;
  hostname: string;
  username: string;
}
