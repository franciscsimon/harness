// ─── Ticket Kanban Board ─────────────────────────────────────────
// Client-side drag-and-drop for ticket status transitions.
// Phase D: UI Pages

const STATUSES = ["open", "in_progress", "review", "done", "closed"];

let currentProject = null;

async function loadTickets(projectId) {
  currentProject = projectId;
  const params = projectId ? `?projectId=${projectId}` : "";
  const res = await fetch(`/api/tickets${params}`);
  const tickets = await res.json();
  renderKanban(tickets);
}

function renderKanban(tickets) {
  const board = document.getElementById("kanban-board");
  if (!board) return;

  board.innerHTML = "";
  for (const status of STATUSES) {
    const col = document.createElement("div");
    col.className = "kanban-column";
    col.dataset.status = status;
    col.innerHTML = `<h3>${status.replace("_", " ")}</h3>`;

    const statusTickets = tickets.filter((t) => t.status === status);
    for (const ticket of statusTickets) {
      const card = document.createElement("div");
      card.className = `kanban-card priority-${ticket.priority}`;
      card.draggable = true;
      card.dataset.ticketId = ticket._id;
      card.innerHTML = `
        <div class="card-title">${escapeHtml(ticket.title)}</div>
        <div class="card-meta">
          <span class="priority">${ticket.priority}</span>
          ${ticket.assignee ? `<span class="assignee">${escapeHtml(ticket.assignee)}</span>` : ""}
        </div>
      `;
      card.addEventListener("dragstart", onDragStart);
      col.appendChild(card);
    }

    col.addEventListener("dragover", (e) => e.preventDefault());
    col.addEventListener("drop", onDrop);
    board.appendChild(col);
  }
}

function onDragStart(e) {
  e.dataTransfer.setData("text/plain", e.target.dataset.ticketId);
}

async function onDrop(e) {
  e.preventDefault();
  const ticketId = e.dataTransfer.getData("text/plain");
  const newStatus = e.currentTarget.dataset.status;

  try {
    await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await loadTickets(currentProject);
  } catch (err) {
    console.error("Transition failed:", err);
  }
}

async function createTicket(form) {
  const data = {
    title: form.title.value,
    project_id: form.project_id.value,
    priority: form.priority.value,
    description: form.description?.value ?? "",
    assignee: form.assignee?.value ?? "",
  };

  try {
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      form.reset();
      await loadTickets(currentProject);
    }
  } catch (err) {
    console.error("Create failed:", err);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Auto-load on page ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => loadTickets(null));
} else {
  loadTickets(null);
}
