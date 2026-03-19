/* ─── Event Stream Client ──────────────────────────────────────── */

(function () {
  "use strict";

  // ── Category colors (must match server) ──
  const COLORS = {
    session: "#3b82f6", compaction: "#8b5cf6", agent: "#22c55e", message: "#06b6d4",
    tool: "#f97316", input: "#eab308", model: "#ec4899", resource: "#6b7280",
  };

  // ── State ──
  let paused = false;
  let pendingWhilePaused = [];
  let activeCategories = new Set(Object.keys(COLORS));
  let searchText = "";
  let sessionFilter = "";

  // ── DOM refs ──
  const stream = document.getElementById("stream");
  const btnPause = document.getElementById("btn-pause");
  const searchInput = document.getElementById("search");
  const sessionPicker = document.getElementById("session-picker");
  const connStatus = document.getElementById("conn-status");

  // ── SSE connection ──
  let evtSource = null;
  let maxSeenSeq = -1;

  function connect() {
    if (evtSource) evtSource.close();
    evtSource = new EventSource("/api/events/stream");

    evtSource.addEventListener("event", function (e) {
      const ev = JSON.parse(e.data);
      if (ev.seq > maxSeenSeq) maxSeenSeq = ev.seq;
      if (paused) {
        pendingWhilePaused.push(ev);
        btnPause.textContent = "▶ Resume (" + pendingWhilePaused.length + ")";
        return;
      }
      addCard(ev);
    });

    evtSource.addEventListener("stats", function (e) {
      const stats = JSON.parse(e.data);
      updateStats(stats);
    });

    evtSource.addEventListener("open", function () {
      connStatus.textContent = "●";
      connStatus.style.color = "#22c55e";
      connStatus.title = "Connected";
    });

    evtSource.addEventListener("error", function () {
      connStatus.textContent = "●";
      connStatus.style.color = "#ef4444";
      connStatus.title = "Disconnected — reconnecting...";
    });
  }

  // ── Card rendering ──

  function addCard(ev) {
    if (!passesFilter(ev)) return;

    const card = document.createElement("div");
    card.className = "event-card";
    card.dataset.category = ev.category;
    card.dataset.eventName = ev.eventName;
    card.dataset.id = ev.id;

    const color = COLORS[ev.category] || "#999";

    // Header line
    let html = '<div class="card-header">';
    html += '<span class="cat-dot" style="background:' + color + '"></span>';
    html += '<span class="card-name">' + esc(ev.eventName) + '</span>';
    html += '<span class="cat-badge" style="background:' + color + '">' + esc(ev.category) + '</span>';
    html += '<span class="card-seq">#' + ev.seq + '</span>';
    html += '<span class="card-time">' + relativeTime(ev.ts) + '</span>';
    html += '</div>';

    // Fields line
    var fields = ev.fields || {};
    var keys = Object.keys(fields);
    if (keys.length > 0) {
      html += '<div class="card-fields">';
      for (var i = 0; i < keys.length; i++) {
        var val = fields[keys[i]];
        if (val && String(val).length > 60) val = String(val).slice(0, 57) + "...";
        html += '<span class="field-pair"><span class="field-k">' + esc(keys[i]) + ':</span> ' + esc(String(val)) + '</span>';
      }
      html += '</div>';
    }

    // Detail link
    html += '<div class="card-detail-link"><a href="/event/' + encodeURIComponent(ev.id) + '" target="_blank">View detail →</a></div>';

    card.innerHTML = html;
    card.style.borderLeftColor = color;

    // Animate in
    card.classList.add("card-enter");
    stream.prepend(card);
    requestAnimationFrame(function () { card.classList.remove("card-enter"); });

    // Cap at 500 cards in DOM
    while (stream.children.length > 500) {
      stream.removeChild(stream.lastChild);
    }
  }

  // ── Filters ──

  function passesFilter(ev) {
    if (!activeCategories.has(ev.category)) return false;
    if (searchText && ev.eventName.indexOf(searchText) === -1) return false;
    if (sessionFilter && ev.sessionId !== sessionFilter) return false;
    return true;
  }

  // Category pill toggles
  document.querySelectorAll(".cat-pill").forEach(function (pill) {
    pill.addEventListener("click", function () {
      var cat = this.dataset.category;
      if (activeCategories.has(cat)) {
        activeCategories.delete(cat);
        this.classList.remove("active");
      } else {
        activeCategories.add(cat);
        this.classList.add("active");
      }
      refilterCards();
    });
  });

  // Search
  searchInput.addEventListener("input", function () {
    searchText = this.value.toLowerCase();
    refilterCards();
  });

  // Session picker
  sessionPicker.addEventListener("change", function () {
    sessionFilter = this.value;
    refilterCards();
  });

  function refilterCards() {
    var cards = stream.querySelectorAll(".event-card");
    cards.forEach(function (card) {
      var cat = card.dataset.category;
      var name = card.dataset.eventName;
      var show = activeCategories.has(cat);
      if (show && searchText) show = name.indexOf(searchText) !== -1;
      card.style.display = show ? "" : "none";
    });
  }

  // ── Pause/Resume ──

  btnPause.addEventListener("click", function () {
    if (paused) {
      paused = false;
      btnPause.textContent = "⏸ Pause";
      // Flush pending
      for (var i = 0; i < pendingWhilePaused.length; i++) {
        addCard(pendingWhilePaused[i]);
      }
      pendingWhilePaused = [];
    } else {
      paused = true;
      btnPause.textContent = "▶ Resume (0)";
    }
  });

  // ── Stats ──

  function updateStats(stats) {
    var el = document.getElementById("stat-total");
    if (el) el.textContent = "Total: " + stats.total;
    var cats = Object.keys(COLORS);
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      var val = stats.byCategory[c] || 0;
      var el1 = document.getElementById("stat-" + c);
      if (el1) el1.textContent = val;
      var el2 = document.getElementById("stat-bar-" + c);
      if (el2) el2.textContent = val;
    }
  }

  // ── Helpers ──

  function relativeTime(ts) {
    var diff = Date.now() - ts;
    if (diff < 1000) return "now";
    if (diff < 60000) return Math.floor(diff / 1000) + "s ago";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return Math.floor(diff / 86400000) + "d ago";
  }

  function esc(s) {
    if (!s) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Update times every 10s ──
  setInterval(function () {
    stream.querySelectorAll(".card-time").forEach(function (el) {
      // We'd need the ts stored — skip for now, times are set at render
    });
  }, 10000);

  // ── Wipe DB button ──
  var btnWipe = document.getElementById("btn-wipe");
  if (btnWipe) {
    btnWipe.addEventListener("click", function () {
      modal.confirm("Wipe Database", "This will permanently erase ALL events from the database.\n\nAre you sure?", "danger").then(function (ok) {
        if (!ok) return;
        btnWipe.disabled = true;
        btnWipe.textContent = "Wiping...";
        fetch("/api/wipe", { method: "POST" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            modal.alert("Database Wiped", data.message, "success").then(function () {
              window.location.reload();
            });
          })
          .catch(function (err) {
            modal.alert("Wipe Failed", String(err), "danger");
            btnWipe.disabled = false;
            btnWipe.textContent = "Wipe DB";
          });
      });
    });
  }

  // ── Start ──
  connect();
})();
