/* ─── Event Stream Client (Hybrid: live + paginated history) ──── */

(() => {
  const COLORS = {
    session: "#3b82f6",
    compaction: "#8b5cf6",
    agent: "#22c55e",
    message: "#06b6d4",
    tool: "#f97316",
    input: "#eab308",
    model: "#ec4899",
    resource: "#6b7280",
  };

  let paused = false;
  let pendingWhilePaused = [];
  const activeCategories = new Set(Object.keys(COLORS));
  let searchText = "";
  let sessionFilter = "";
  let liveCount = 0;

  const liveStream = document.getElementById("live-stream");
  const historyList = document.getElementById("history-list");
  const btnPause = document.getElementById("btn-pause");
  const btnLoadMore = document.getElementById("btn-load-more");
  const searchInput = document.getElementById("search");
  const sessionPicker = document.getElementById("session-picker");
  const connStatus = document.getElementById("conn-status");
  const liveCounter = document.getElementById("live-counter");

  // ── SSE: live-only (no backfill) ──

  let evtSource = null;

  function connect() {
    if (evtSource) evtSource.close();
    const apiBase = window.EVENT_API || "";
    evtSource = new EventSource(`${apiBase}/api/events/stream`);

    evtSource.addEventListener("event", (e) => {
      const ev = JSON.parse(e.data);
      if (paused) {
        pendingWhilePaused.push(ev);
        btnPause.textContent = `▶ Resume (${pendingWhilePaused.length})`;
        return;
      }
      addLiveCard(ev);
    });

    evtSource.addEventListener("stats", (e) => {
      const stats = JSON.parse(e.data);
      const el = document.getElementById("stat-total");
      if (el) el.textContent = `Total: ${stats.total}`;
    });

    evtSource.addEventListener("open", () => {
      connStatus.textContent = "●";
      connStatus.style.color = "#22c55e";
      connStatus.title = "Connected";
    });

    evtSource.addEventListener("error", () => {
      connStatus.textContent = "●";
      connStatus.style.color = "#ef4444";
      connStatus.title = "Disconnected — reconnecting...";
    });
  }

  function addLiveCard(ev) {
    if (!passesFilter(ev)) return;
    liveCount++;
    if (liveCounter) liveCounter.textContent = liveCount;

    const card = makeCard(ev);
    card.classList.add("card-enter");
    liveStream.prepend(card);
    requestAnimationFrame(() => {
      card.classList.remove("card-enter");
    });

    // Cap live cards at 200
    while (liveStream.children.length > 200) {
      liveStream.removeChild(liveStream.lastChild);
    }
  }

  // ── History: paginated via API ──

  let historyOffset = 0;
  const PAGE_SIZE = 50;
  let loading = false;

  async function loadHistory() {
    if (loading) return;
    loading = true;
    btnLoadMore.textContent = "Loading...";
    btnLoadMore.disabled = true;

    try {
      const apiBase = window.EVENT_API || "";
      let url = `${apiBase}/api/events?limit=${PAGE_SIZE}`;
      if (sessionFilter) url += `&session_id=${encodeURIComponent(sessionFilter)}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!r.ok) throw new Error(`API returned ${r.status}`);
      const events = await r.json();

      if (events.length === 0) {
        btnLoadMore.textContent = "No more events";
        btnLoadMore.disabled = true;
        loading = false;
        return;
      }

      // Clear and re-render (since we fetch with increasing limit)
      historyList.innerHTML = "";
      for (const ev of events) {
        if (passesFilter(ev)) {
          const card = makeCard(ev);
          historyList.appendChild(card);
        }
      }

      historyOffset = events.length;
      btnLoadMore.textContent = `Load More (${historyOffset} shown)`;
      btnLoadMore.disabled = false;
    } catch (_e) {
      btnLoadMore.textContent = "Error — retry";
      btnLoadMore.disabled = false;
    }
    loading = false;
  }

  // ── Shared card renderer ──

  function makeCard(ev) {
    const card = document.createElement("div");
    card.className = "event-card";
    card.dataset.category = ev.category;
    card.dataset.eventName = ev.eventName;
    card.dataset.id = ev.id;
    if (ev.seq) card.dataset.seq = ev.seq;

    const color = COLORS[ev.category] || "#999";

    let html = '<div class="card-header">';
    html += `<span class="cat-dot" style="background:${color}"></span>`;
    html += `<span class="card-name">${esc(ev.eventName)}</span>`;
    html += `<span class="cat-badge" style="background:${color}">${esc(ev.category)}</span>`;
    if (ev.seq) html += `<span class="card-seq">#${ev.seq}</span>`;
    html += `<span class="card-time">${relativeTime(ev.ts)}</span>`;
    html += "</div>";

    const fields = ev.fields || {};
    const keys = Object.keys(fields);
    if (keys.length > 0) {
      html += '<div class="card-fields">';
      for (let i = 0; i < Math.min(keys.length, 5); i++) {
        let val = fields[keys[i]];
        if (val && String(val).length > 60) val = `${String(val).slice(0, 57)}...`;
        html += `<span class="field-pair"><span class="field-k">${esc(keys[i])}:</span> ${esc(String(val))}</span>`;
      }
      if (keys.length > 5) html += `<span class="field-pair">+${keys.length - 5} more</span>`;
      html += "</div>";
    }

    html += `<div class="card-detail-link"><a href="/event/${encodeURIComponent(ev.id)}">View detail →</a></div>`;

    card.innerHTML = html;
    card.style.borderLeftColor = color;
    return card;
  }

  // ── Filters ──

  function passesFilter(ev) {
    if (!activeCategories.has(ev.category)) return false;
    if (searchText && (ev.eventName || "").toLowerCase().indexOf(searchText) === -1) return false;
    if (sessionFilter && ev.sessionId !== sessionFilter) return false;
    return true;
  }

  document.querySelectorAll(".cat-pill").forEach((pill) => {
    pill.addEventListener("click", function () {
      const cat = this.dataset.category;
      if (activeCategories.has(cat)) {
        activeCategories.delete(cat);
        this.classList.remove("active");
      } else {
        activeCategories.add(cat);
        this.classList.add("active");
      }
    });
  });

  if (searchInput)
    searchInput.addEventListener("input", function () {
      searchText = this.value.toLowerCase();
    });

  if (sessionPicker)
    sessionPicker.addEventListener("change", function () {
      sessionFilter = this.value;
      // Reset history when session changes
      historyList.innerHTML = "";
      historyOffset = 0;
      loadHistory();
    });

  // ── Pause/Resume ──

  if (btnPause)
    btnPause.addEventListener("click", () => {
      if (paused) {
        paused = false;
        btnPause.textContent = "⏸ Pause";
        for (const ev of pendingWhilePaused) addLiveCard(ev);
        pendingWhilePaused = [];
      } else {
        paused = true;
        btnPause.textContent = "▶ Resume (0)";
      }
    });

  // ── Load More ──

  if (btnLoadMore) btnLoadMore.addEventListener("click", loadHistory);

  // ── Helpers ──

  function relativeTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 1000) return "now";
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function esc(s) {
    if (!s) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Init ──

  connect();
  loadHistory(); // Load first page of history
})();
