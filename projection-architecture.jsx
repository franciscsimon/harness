import { useState } from "react";

const C = {
  bg: "#0c0f1a",
  surface: "#131825",
  surfaceHover: "#1a2035",
  border: "#1e2740",
  borderActive: "#3b82f6",
  text: "#e2e8f0",
  muted: "#8b9dc3",
  dim: "#4a5578",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  pink: "#ec4899",
  cyan: "#06b6d4",
  teal: "#14b8a6",
};

const rawEvents = [
  { id: 0, type: "session_start", tag: "SESSION", tagColor: C.blue, detail: "", indent: 0 },
  { id: 4, type: "input", tag: "INPUT", tagColor: C.amber, detail: 'input_text: "commit changes"', indent: 0 },
  {
    id: 5,
    type: "before_agent_start",
    tag: "AGENT",
    tagColor: C.green,
    detail: "prompt_text: commit changes",
    indent: 1,
    group: "run",
  },
  { id: 6, type: "agent_start", tag: "AGENT", tagColor: C.green, detail: "", indent: 1, group: "run" },
  { id: 8, type: "turn_start", tag: "AGENT", tagColor: C.green, detail: "turn_index: 0", indent: 2, group: "turn" },
  {
    id: 9,
    type: "message_start",
    tag: "MESSAGE",
    tagColor: C.cyan,
    detail: "message_role: user",
    indent: 2,
    group: "turn",
  },
  {
    id: 12,
    type: "message_start",
    tag: "MESSAGE",
    tagColor: C.cyan,
    detail: "message_role: assistant",
    indent: 2,
    group: "turn",
  },
  {
    id: 13,
    type: "message_update",
    tag: "MESSAGE",
    tagColor: C.cyan,
    detail: "stream_delta_type: thinking_start",
    indent: 2,
    group: "reasoning",
    highlight: true,
  },
  {
    id: 14,
    type: "message_update",
    tag: "MESSAGE",
    tagColor: C.cyan,
    detail: "stream_delta_len: 0  ← reasoning tokens",
    indent: 2,
    group: "reasoning",
    highlight: true,
  },
  {
    id: 15,
    type: "message_end",
    tag: "MESSAGE",
    tagColor: C.cyan,
    detail: "message_role: assistant",
    indent: 2,
    group: "reasoning",
  },
  {
    id: 16,
    type: "tool_execution_start",
    tag: "TOOL",
    tagColor: C.red,
    detail: "tool_name: bash",
    indent: 3,
    group: "tool",
  },
  {
    id: 17,
    type: "tool_call",
    tag: "TOOL",
    tagColor: C.red,
    detail: '{"command":"cd … && git status"}',
    indent: 3,
    group: "tool",
  },
  { id: 19, type: "tool_result", tag: "TOOL", tagColor: C.red, detail: "is_error: false", indent: 3, group: "tool" },
  {
    id: 20,
    type: "tool_execution_end",
    tag: "TOOL",
    tagColor: C.red,
    detail: "is_error: false",
    indent: 3,
    group: "tool",
  },
  {
    id: 24,
    type: "turn_end",
    tag: "AGENT",
    tagColor: C.green,
    detail: "turn_end_tool_count: 1",
    indent: 2,
    group: "turn",
  },
  {
    id: 47,
    type: "agent_end",
    tag: "AGENT",
    tagColor: C.green,
    detail: "agent_end_msg_count: 6",
    indent: 1,
    group: "run",
  },
];

const projections = [
  {
    id: "task",
    label: "AgentTaskRequested",
    color: C.blue,
    sourceIds: [4, 5],
    sourceLabel: "input + before_agent_start",
    description: "Projected from the INPUT event. Captures the human intent and session context.",
    fields: [
      { k: "@type", v: '"schema:AgentTaskRequested"' },
      { k: "xt/id", v: '"task_<session>_<run>"' },
      { k: "prompt", v: '"commit changes"' },
      { k: "inputSource", v: '"interactive"' },
      { k: "sessionRef", v: '"sess_ff16c41e…"' },
      { k: "contextMsgCount", v: "81" },
      { k: "compactTokens", v: "80517" },
    ],
  },
  {
    id: "reasoning",
    label: "AgentReasoningTrace",
    color: C.purple,
    sourceIds: [8, 12, 13, 14, 15, 24],
    sourceLabel: "turn_start → thinking → message_end → turn_end",
    description:
      "Projected from thinking blocks + message deltas within each Turn. One event per turn, containing the full reasoning chain and all tool interactions.",
    fields: [
      { k: "@type", v: '"schema:AgentReasoningTrace"' },
      { k: "xt/id", v: '"reasoning_<session>_<turn>"' },
      { k: "parentTaskId", v: '"task_<session>_<run>"' },
      { k: "turnIndex", v: "0" },
      { k: "thinkingContent", v: '"full thinking text…"' },
      { k: "toolCalls[]", v: "[{name, payload, result, error}]" },
      { k: "providerPayloadBytes", v: "107258" },
      { k: "toolCount", v: "1" },
    ],
  },
  {
    id: "result",
    label: "AgentResultProduced",
    color: C.green,
    sourceIds: [47],
    sourceLabel: "agent_end + final assistant message",
    description:
      "Projected from the final assistant message and agent_end event. Captures what was actually delivered — the output text, code, or action summary.",
    fields: [
      { k: "@type", v: '"schema:AgentResultProduced"' },
      { k: "xt/id", v: '"result_<session>_<run>"' },
      { k: "parentTaskId", v: '"task_<session>_<run>"' },
      { k: "reasoningTraceIds[]", v: '["reasoning_…_t0", "…_t1", "…_t2"]' },
      { k: "totalTurns", v: "3" },
      { k: "totalMsgCount", v: "6" },
      { k: "outputSummary", v: '"Committed 3 files to main…"' },
    ],
  },
  {
    id: "changes",
    label: "ProjectStateChanged",
    color: C.amber,
    sourceIds: [17, 19],
    sourceLabel: "tool_call(bash) + tool_result — diffed",
    description:
      "Derived by analyzing tool_call payloads for state-mutating commands (git commit, file write, etc.) and diffing before/after. This is the ONLY event type that requires derivation beyond direct projection.",
    fields: [
      { k: "@type", v: '"schema:ProjectStateChanged"' },
      { k: "xt/id", v: '"change_<session>_<run>"' },
      { k: "parentTaskId", v: '"task_<session>_<run>"' },
      { k: "resultId", v: '"result_<session>_<run>"' },
      { k: "mutations[]", v: "[{entity, op, diff, beforeHash, afterHash}]" },
      { k: "mutatingCommands[]", v: '["git commit -m …"]' },
    ],
  },
];

const _Arrow = ({ color }) => (
  <div style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}>
    <svg width="20" height="20" viewBox="0 0 20 20">
      <path d="M10 4 L10 14 M6 10 L10 14 L14 10" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  </div>
);

export default function ProjectionArchitecture() {
  const [activeProjection, setActiveProjection] = useState(null);
  const [hoveredSource, setHoveredSource] = useState(null);

  const highlightedIds = activeProjection ? projections.find((p) => p.id === activeProjection)?.sourceIds || [] : [];

  return (
    <div
      style={{
        background: C.bg,
        color: C.text,
        minHeight: "100vh",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
        padding: "28px 20px",
        maxWidth: 1000,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: C.purple, marginBottom: 6 }}
        >
          Event Projection Model
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: C.text }}>
          JSONL Session Stream → XTDB JSON-LD Events
        </h1>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 8, lineHeight: 1.6, maxWidth: 680 }}>
          Your pi.dev session already captures everything. The missing piece is a{" "}
          <span style={{ color: C.green, fontWeight: 600 }}>projector</span> that transforms raw runtime events into
          semantic domain events in XTDB. Click any output event to see its source mapping.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", gap: 0, alignItems: "start" }}>
        {/* LEFT: Raw JSONL Stream */}
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: C.dim,
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, display: "inline-block" }} />
            Source: pi.dev JSONL Session (47 events)
          </div>
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "8px 0",
              maxHeight: 720,
              overflowY: "auto",
            }}
          >
            {rawEvents.map((evt) => {
              const isHighlighted = highlightedIds.includes(evt.id);
              const isHovered = hoveredSource === evt.id;
              return (
                <div
                  key={evt.id}
                  onMouseEnter={() => setHoveredSource(evt.id)}
                  onMouseLeave={() => setHoveredSource(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: `5px 12px 5px ${12 + evt.indent * 16}px`,
                    fontSize: 11,
                    background: isHighlighted
                      ? `${projections.find((p) => p.sourceIds.includes(evt.id))?.color || C.blue}12`
                      : isHovered
                        ? C.surfaceHover
                        : "transparent",
                    borderLeft: isHighlighted
                      ? `2px solid ${projections.find((p) => p.sourceIds.includes(evt.id))?.color || C.blue}`
                      : "2px solid transparent",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ color: C.dim, minWidth: 24, textAlign: "right", fontSize: 10 }}>#{evt.id}</span>
                  <span
                    style={{
                      color: evt.highlight ? C.purple : C.text,
                      fontWeight: evt.highlight ? 600 : 400,
                      minWidth: 170,
                    }}
                  >
                    {evt.type}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: `${evt.tagColor}20`,
                      color: evt.tagColor,
                      border: `1px solid ${evt.tagColor}30`,
                    }}
                  >
                    {evt.tag}
                  </span>
                  <span
                    style={{
                      color: C.dim,
                      fontSize: 10,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {evt.detail}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER: Projection Arrow */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            paddingTop: 60,
          }}
        >
          <div
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              fontSize: 9,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: C.green,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            PROJECT
          </div>
          <svg width="24" height="200" viewBox="0 0 24 200">
            <defs>
              <linearGradient id="arrowGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={C.red} />
                <stop offset="100%" stopColor={C.green} />
              </linearGradient>
            </defs>
            <line x1="12" y1="0" x2="12" y2="190" stroke="url(#arrowGrad)" strokeWidth="1.5" strokeDasharray="4 3" />
            <path d="M7 185 L12 195 L17 185" stroke={C.green} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        {/* RIGHT: Projected JSON-LD Events */}
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: C.dim,
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, display: "inline-block" }} />
            Target: XTDB JSON-LD Domain Events
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {projections.map((proj, i) => {
              const isActive = activeProjection === proj.id;
              return (
                <div key={proj.id}>
                  <div
                    onClick={() => setActiveProjection(isActive ? null : proj.id)}
                    style={{
                      background: isActive ? C.surfaceHover : C.surface,
                      border: `1px solid ${isActive ? proj.color : C.border}`,
                      borderRadius: 8,
                      padding: "12px 16px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 3,
                            background: proj.color,
                            opacity: 0.8,
                          }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600, color: proj.color }}>{proj.label}</span>
                      </div>
                      <span style={{ fontSize: 10, color: C.dim }}>{isActive ? "▾" : "▸"}</span>
                    </div>

                    <div style={{ fontSize: 10, color: C.muted, marginTop: 6, marginLeft: 20 }}>
                      ← {proj.sourceLabel}
                    </div>

                    {isActive && (
                      <div style={{ marginTop: 12, marginLeft: 20 }}>
                        <div
                          style={{ fontSize: 10, color: C.dim, marginBottom: 6, fontStyle: "italic", lineHeight: 1.5 }}
                        >
                          {proj.description}
                        </div>
                        <div
                          style={{
                            background: C.bg,
                            borderRadius: 6,
                            padding: "10px 14px",
                            border: `1px solid ${C.border}`,
                          }}
                        >
                          {proj.fields.map((f, j) => (
                            <div
                              key={j}
                              style={{
                                display: "flex",
                                gap: 10,
                                padding: "3px 0",
                                fontSize: 11,
                                borderBottom: j < proj.fields.length - 1 ? `1px solid ${C.border}` : "none",
                              }}
                            >
                              <span style={{ color: proj.color, minWidth: 180, flexShrink: 0 }}>{f.k}</span>
                              <span style={{ color: C.muted }}>{f.v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {i < projections.length - 1 && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "2px 0" }}>
                      <div style={{ width: 1, height: 8, background: C.border }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom: The Key Insight */}
      <div
        style={{
          marginTop: 32,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "20px 24px",
        }}
      >
        <div
          style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: C.dim, marginBottom: 12 }}
        >
          The Projector — What Needs to Be Built
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
          <p style={{ margin: "0 0 10px" }}>
            <span style={{ color: C.green, fontWeight: 600 }}>Option A — Pi Extension (real-time):</span> A pi.dev
            extension that listens to the event stream as it happens and writes JSON-LD events to XTDB in real-time.
            Uses pi's{" "}
            <code style={{ background: `${C.blue}15`, padding: "1px 5px", borderRadius: 3, color: C.blue }}>
              onEvent
            </code>{" "}
            hook. Events are written as each turn completes.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            <span style={{ color: C.amber, fontWeight: 600 }}>Option B — Session File Watcher (batch):</span> A separate
            process that watches the JSONL session files, parses completed sessions, and projects them into XTDB.
            Simpler to build, but not real-time. Good for backfilling existing session history.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            <span style={{ color: C.purple, fontWeight: 600 }}>The critical extraction:</span> The{" "}
            <code style={{ background: `${C.purple}15`, padding: "1px 5px", borderRadius: 3, color: C.purple }}>
              thinking_start
            </code>{" "}
            /{" "}
            <code style={{ background: `${C.purple}15`, padding: "1px 5px", borderRadius: 3, color: C.purple }}>
              message_update
            </code>{" "}
            deltas contain the full reasoning text. Accumulate these within each turn to reconstruct the complete
            chain-of-thought. This is your <span style={{ color: C.purple }}>AgentReasoningTrace</span>.
          </p>
          <p style={{ margin: 0 }}>
            <span style={{ color: C.red, fontWeight: 600 }}>Change detection:</span> Parse{" "}
            <code style={{ background: `${C.red}15`, padding: "1px 5px", borderRadius: 3, color: C.red }}>
              tool_call
            </code>{" "}
            payloads for mutating commands (git commit, file write, edit). Diff project state before/after the agent
            run. This is the only part requiring inference — everything else is direct projection.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 10, color: C.dim, textAlign: "center" }}>
        Click any target event on the right to highlight its source events on the left
      </div>
    </div>
  );
}
