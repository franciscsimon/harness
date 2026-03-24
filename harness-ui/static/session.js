/* ─── Session Timeline Grouping ─────────────────────────────── */
/* Scans flat .tl-event nodes and wraps them in nested,
   collapsible groups: Agent Run → Turn → Tool Execution.       */

(() => {
  var timeline = document.getElementById("timeline");
  if (!timeline) return;

  // ── Collect all event nodes ──
  var allEvents = Array.from(timeline.querySelectorAll(".tl-event"));
  if (allEvents.length === 0) return;

  // ── Build a virtual tree, then re-render into DOM ──
  // Each node is either a raw event or a group { type, label, children[] }

  var ROOT = []; // top-level items
  var agentRun = null; // current open AgentRun group
  var turn = null; // current open Turn group
  var toolExec = null; // current open ToolExec group
  var agentRunIdx = 0;

  for (var i = 0; i < allEvents.length; i++) {
    var el = allEvents[i];
    var name = el.dataset.eventName;

    // ── Boundary detection ──

    if (name === "before_agent_start" || name === "agent_start") {
      if (name === "before_agent_start" || (name === "agent_start" && !agentRun)) {
        // Close any open groups
        closeToolExec();
        closeTurn();
        closeAgentRun();
        agentRunIdx++;
        agentRun = { type: "agent", label: `Agent Run #${agentRunIdx}`, children: [], color: "#22c55e" };
      }
      agentRun.children.push(el);
      continue;
    }

    if (name === "agent_end") {
      closeToolExec();
      closeTurn();
      if (agentRun) {
        agentRun.children.push(el);
        closeAgentRun();
      } else {
        ROOT.push(el);
      }
      continue;
    }

    if (name === "turn_start") {
      closeToolExec();
      closeTurn();
      var tIdx = el.dataset.turnIndex;
      turn = { type: "turn", label: `Turn ${tIdx !== "" ? tIdx : "?"}`, children: [], color: "#3b82f6" };
      turn.children.push(el);
      continue;
    }

    if (name === "turn_end") {
      closeToolExec();
      if (turn) {
        turn.children.push(el);
        closeTurn();
      } else if (agentRun) {
        agentRun.children.push(el);
      } else {
        ROOT.push(el);
      }
      continue;
    }

    if (name === "tool_execution_start") {
      closeToolExec();
      var tName = el.dataset.toolName || "tool";
      var tCallId = el.dataset.toolCallId;
      var lbl = `Tool: ${tName}`;
      if (tCallId) lbl += ` (${tCallId})`;
      toolExec = { type: "tool", label: lbl, children: [], color: "#f97316" };
      toolExec.children.push(el);
      continue;
    }

    if (name === "tool_execution_end") {
      if (toolExec) {
        toolExec.children.push(el);
        closeToolExec();
      } else if (turn) {
        turn.children.push(el);
      } else if (agentRun) {
        agentRun.children.push(el);
      } else {
        ROOT.push(el);
      }
      continue;
    }

    // ── Regular event: push into innermost open group ──
    if (toolExec) {
      toolExec.children.push(el);
    } else if (turn) {
      turn.children.push(el);
    } else if (agentRun) {
      agentRun.children.push(el);
    } else {
      ROOT.push(el);
    }
  }

  // Close anything left open
  closeToolExec();
  closeTurn();
  closeAgentRun();

  function closeToolExec() {
    if (!toolExec) return;
    if (turn) {
      turn.children.push(toolExec);
    } else if (agentRun) {
      agentRun.children.push(toolExec);
    } else {
      ROOT.push(toolExec);
    }
    toolExec = null;
  }

  function closeTurn() {
    if (!turn) return;
    if (agentRun) {
      agentRun.children.push(turn);
    } else {
      ROOT.push(turn);
    }
    turn = null;
  }

  function closeAgentRun() {
    if (!agentRun) return;
    ROOT.push(agentRun);
    agentRun = null;
  }

  // ── Render tree into DOM ──

  timeline.innerHTML = "";
  renderItems(ROOT, timeline, 0);

  function renderItems(items, parent, depth) {
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      if (item instanceof HTMLElement) {
        // Raw event node — set indent
        item.style.paddingLeft = `${16 + depth * 24}px`;
        parent.appendChild(item);
      } else {
        // Group node — create collapsible wrapper
        var group = document.createElement("div");
        group.className = `tl-group tl-group-${item.type}`;
        group.style.marginLeft = `${depth * 24}px`;

        var header = document.createElement("div");
        header.className = "tl-group-header";
        header.style.borderLeftColor = item.color;
        header.innerHTML =
          '<span class="tl-group-toggle">▼</span>' +
          '<span class="tl-group-label" style="color:' +
          item.color +
          '">' +
          esc(item.label) +
          "</span>" +
          '<span class="tl-group-count">' +
          countEvents(item) +
          " events</span>";

        var body = document.createElement("div");
        body.className = "tl-group-body";

        header.addEventListener(
          "click",
          ((b, h) => () => {
            var collapsed = b.classList.toggle("collapsed");
            h.querySelector(".tl-group-toggle").textContent = collapsed ? "▶" : "▼";
          })(body, header),
        );

        group.appendChild(header);
        group.appendChild(body);
        parent.appendChild(group);

        renderItems(item.children, body, depth + 1);
      }
    }
  }

  function countEvents(group) {
    var n = 0;
    for (var k = 0; k < group.children.length; k++) {
      var c = group.children[k];
      if (c instanceof HTMLElement) n++;
      else n += countEvents(c);
    }
    return n;
  }

  // ── Expand All / Collapse All ──

  var btnExpand = document.getElementById("btn-expand-all");
  var btnCollapse = document.getElementById("btn-collapse-all");

  if (btnExpand) {
    btnExpand.addEventListener("click", () => {
      timeline.querySelectorAll(".tl-group-body.collapsed").forEach((b) => {
        b.classList.remove("collapsed");
        b.previousElementSibling.querySelector(".tl-group-toggle").textContent = "▼";
      });
    });
  }

  if (btnCollapse) {
    btnCollapse.addEventListener("click", () => {
      timeline.querySelectorAll(".tl-group-body:not(.collapsed)").forEach((b) => {
        b.classList.add("collapsed");
        b.previousElementSibling.querySelector(".tl-group-toggle").textContent = "▶";
      });
    });
  }

  // ── Helper ──
  function esc(s) {
    if (!s) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
})();
