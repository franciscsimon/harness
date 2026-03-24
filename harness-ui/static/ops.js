(() => {
  var API = "";
  var apiBanner = document.getElementById("api-banner");
  var _apiConnected = false;

  function esc(s) {
    if (!s) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function setApiStatus(connected) {
    _apiConnected = connected;
    if (connected) {
      apiBanner.className = "ops-api-banner ops-api-connected";
      apiBanner.innerHTML = "Ops API connected";
    } else {
      apiBanner.className = "ops-api-banner ops-api-disconnected";
      apiBanner.innerHTML = "Ops API unreachable";
    }
  }

  // ── Health ─────────────────────────────────────────────────────

  function refreshHealth() {
    fetch(`${API}/api/health`)
      .then((r) => r.json())
      .then((data) => {
        setApiStatus(true);
        if (!data.components) return;
        data.components.forEach((comp) => {
          var id = comp.name === "redpanda" ? "redpanda" : comp.name;
          var card = document.getElementById(`hc-${id}`);
          var statusEl = document.getElementById(`hc-${id}-status`);
          var detailsEl = document.getElementById(`hc-${id}-details`);
          if (!card) return;
          card.className = `ops-health-card ops-hc-${comp.status}`;
          statusEl.textContent = comp.status.toUpperCase();
          statusEl.className = `ops-hc-status ops-hc-status-${comp.status}`;
          var det = Object.keys(comp.details)
            .filter((k) => k !== "output")
            .map((k) => `${k}: ${comp.details[k]}`)
            .join(" | ");
          detailsEl.textContent = det;
        });
      })
      .catch(() => {
        setApiStatus(false);
        ["redpanda", "primary", "replica"].forEach((id) => {
          var card = document.getElementById(`hc-${id}`);
          if (card) card.className = "ops-health-card ops-hc-unknown";
          var st = document.getElementById(`hc-${id}-status`);
          if (st) {
            st.textContent = "API DOWN";
            st.className = "ops-hc-status ops-hc-status-unknown";
          }
        });
      });
  }

  // ── Replication ────────────────────────────────────────────────

  function refreshReplication() {
    fetch(`${API}/api/replication`)
      .then((r) => r.json())
      .then((data) => {
        document.getElementById("repl-primary").textContent = data.primary;
        document.getElementById("repl-replica").textContent = data.replica;
        document.getElementById("repl-lag").textContent = data.lag;
        var syncEl = document.getElementById("repl-synced");
        syncEl.textContent = data.synced ? "YES" : "NO";
        syncEl.className = `ops-repl-value ${data.synced ? "ops-repl-synced" : "ops-repl-lagging"}`;
      })
      .catch(() => {
        /* noop */
      });
  }

  // ── Replica status ─────────────────────────────────────────────

  var btnStop = document.getElementById("btn-replica-stop");
  var btnStart = document.getElementById("btn-replica-start");
  var badge = document.getElementById("replica-badge");

  function refreshReplicaStatus() {
    fetch(`${API}/api/replica/status`)
      .then((r) => r.json())
      .then((data) => {
        badge.textContent = data.running ? "RUNNING" : "STOPPED";
        badge.className = `ops-replica-status-badge ${data.running ? "ops-replica-running" : "ops-replica-stopped"}`;
        btnStop.disabled = !data.running;
        btnStart.disabled = data.running;
      })
      .catch(() => {
        badge.textContent = "UNKNOWN";
      });
  }

  btnStop.addEventListener("click", () => {
    modal.confirm("Stop Replica", "Replication will pause until the replica is restarted.", "danger").then((ok) => {
      if (!ok) return;
      btnStop.disabled = true;
      btnStop.textContent = "Stopping...";
      fetch(`${API}/api/replica/stop`, { method: "POST" })
        .then(() => {
          btnStop.textContent = "Stop Replica";
          setTimeout(() => {
            refreshReplicaStatus();
            refreshHealth();
          }, 2000);
        })
        .catch((err) => {
          modal.alert("Error", `Failed to stop replica: ${err}`, "danger");
          btnStop.disabled = false;
          btnStop.textContent = "Stop Replica";
        });
    });
  });

  btnStart.addEventListener("click", () => {
    btnStart.disabled = true;
    btnStart.textContent = "Starting...";
    fetch(`${API}/api/replica/start`, { method: "POST" })
      .then(() => {
        btnStart.textContent = "Start Replica";
        setTimeout(() => {
          refreshReplicaStatus();
          refreshHealth();
        }, 5000);
      })
      .catch((err) => {
        modal.alert("Error", `Failed to start replica: ${err}`, "danger");
        btnStart.disabled = false;
        btnStart.textContent = "Start Replica";
      });
  });

  // ── Backup ─────────────────────────────────────────────────────

  var btnSnap = document.getElementById("btn-backup-snapshot");
  var btnCsv = document.getElementById("btn-backup-csv");
  var progressEl = document.getElementById("backup-progress");
  var logEl = document.getElementById("backup-log");
  var statusText = document.getElementById("backup-status-text");
  var spinner = document.getElementById("backup-spinner");

  function triggerBackup(type) {
    var url = type === "csv" ? "/api/backup/csv" : "/api/backup";
    btnSnap.disabled = true;
    btnCsv.disabled = true;
    progressEl.style.display = "block";
    logEl.innerHTML = "";
    statusText.textContent = `Starting ${type} backup...`;
    spinner.style.display = "inline-block";

    fetch(API + url, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        var es = new EventSource(`${API}/api/backup/status/${data.jobId}`);

        es.addEventListener("progress", (e) => {
          var msg = JSON.parse(e.data);
          var line = document.createElement("div");
          line.className = "ops-progress-line";
          line.textContent = msg.message;
          logEl.appendChild(line);
          logEl.scrollTop = logEl.scrollHeight;
          statusText.textContent = `Step ${msg.step}: ${msg.message}`;
        });

        es.addEventListener("done", (e) => {
          var msg = JSON.parse(e.data);
          es.close();
          spinner.style.display = "none";
          statusText.textContent =
            msg.status === "completed" ? "Backup complete!" : `Backup failed: ${msg.result || ""}`;
          btnSnap.disabled = false;
          btnCsv.disabled = false;
          refreshBackupList();
        });

        es.addEventListener("error", () => {
          es.close();
          spinner.style.display = "none";
          statusText.textContent = "Connection lost";
          btnSnap.disabled = false;
          btnCsv.disabled = false;
        });
      })
      .catch((err) => {
        spinner.style.display = "none";
        statusText.textContent = `Error: ${err}`;
        btnSnap.disabled = false;
        btnCsv.disabled = false;
      });
  }

  btnSnap.addEventListener("click", () => {
    modal
      .confirm(
        "Snapshot Backup",
        "This will briefly stop the replica to export a consistent snapshot. The primary stays online.",
        "danger",
      )
      .then((ok) => {
        if (ok) triggerBackup("snapshot");
      });
  });

  btnCsv.addEventListener("click", () => {
    triggerBackup("csv");
  });

  // ── Backup list ────────────────────────────────────────────────

  var backupListEl = document.getElementById("backup-list");
  var restoreSelect = document.getElementById("restore-select");

  function refreshBackupList() {
    fetch(`${API}/api/backups`)
      .then((r) => r.json())
      .then((files) => {
        if (!files.length) {
          backupListEl.innerHTML = '<p class="empty-msg">No backups found.</p>';
          restoreSelect.innerHTML = '<option value="">No backups available</option>';
          return;
        }
        backupListEl.innerHTML = files
          .map(
            (f) =>
              '<div class="ops-backup-row">' +
              '<span class="ops-backup-name">' +
              esc(f.filename) +
              "</span>" +
              '<span class="ops-backup-size">' +
              esc(f.sizeHuman) +
              "</span>" +
              '<span class="ops-backup-date">' +
              new Date(f.modifiedAt).toLocaleString() +
              "</span>" +
              '<span class="ops-backup-type ops-backup-type-' +
              f.type +
              '">' +
              f.type +
              "</span>" +
              '<a class="btn btn-sm" href="' +
              API +
              "/api/backups/" +
              encodeURIComponent(f.filename) +
              '" download>Download</a>' +
              '<button class="btn btn-sm btn-danger ops-btn-delete" data-file="' +
              esc(f.filename) +
              '">Delete</button>' +
              "</div>",
          )
          .join("");

        if (files.length === 0) {
          restoreSelect.innerHTML = '<option value="">No backups available</option>';
        } else {
          restoreSelect.innerHTML =
            '<option value="">Select a backup to restore...</option>' +
            files
              .map((f) => {
                var label = `[${f.type}] ${f.filename} (${f.sizeHuman})`;
                return `<option value="${esc(f.filename)}">${esc(label)}</option>`;
              })
              .join("");
        }

        backupListEl.querySelectorAll(".ops-btn-delete").forEach((btn) => {
          btn.addEventListener("click", function () {
            var file = this.dataset.file;
            modal.confirm("Delete Backup", `Delete ${file}? This cannot be undone.`, "danger").then((ok) => {
              if (!ok) return;
              fetch(`${API}/api/backups/${encodeURIComponent(file)}`, { method: "DELETE" })
                .then(() => {
                  refreshBackupList();
                })
                .catch((err) => {
                  modal.alert("Error", `Delete failed: ${err}`, "danger");
                });
            });
          });
        });
      })
      .catch(() => {
        backupListEl.innerHTML = '<p class="empty-msg">Could not reach ops API.</p>';
      });
  }

  // ── Restore ────────────────────────────────────────────────────

  var btnRestore = document.getElementById("btn-restore");

  btnRestore.addEventListener("click", () => {
    var archive = restoreSelect.value;
    if (!archive) {
      modal.alert("No backup selected", "Select a backup from the dropdown first.");
      return;
    }
    var isSnapshot = archive.indexOf("snapshot-") === 0;
    var msg = isSnapshot
      ? `Restore from ${archive}?\n\nThis will STOP both primary and replica, replace the storage, reset the Kafka log, and restart. All nodes will be briefly offline.`
      : `Restore from ${archive}?\nThis will import CSV data into the primary.`;

    modal.confirm("Restore from Backup", msg, "danger").then((ok) => {
      if (!ok) return;
      btnRestore.disabled = true;
      btnRestore.textContent = "Restoring...";
      fetch(`${API}/api/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: archive }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.type === "snapshot" && data.jobId) {
            // Snapshot restore is async — use SSE progress (reuse backup progress panel)
            progressEl.style.display = "block";
            logEl.innerHTML = "";
            statusText.textContent = "Restoring from snapshot...";
            spinner.style.display = "inline-block";

            var es = new EventSource(`${API}/api/backup/status/${data.jobId}`);
            es.addEventListener("progress", (e) => {
              var m = JSON.parse(e.data);
              var line = document.createElement("div");
              line.className = "ops-progress-line";
              line.textContent = m.message;
              logEl.appendChild(line);
              logEl.scrollTop = logEl.scrollHeight;
              statusText.textContent = `Step ${m.step}: ${m.message}`;
            });
            es.addEventListener("done", (e) => {
              var m = JSON.parse(e.data);
              es.close();
              spinner.style.display = "none";
              statusText.textContent =
                m.status === "completed" ? "Restore complete!" : `Restore failed: ${m.result || ""}`;
              btnRestore.disabled = false;
              btnRestore.textContent = "Restore";
              refreshHealth();
              refreshReplicaStatus();
              refreshReplication();
            });
            es.addEventListener("error", () => {
              es.close();
              spinner.style.display = "none";
              statusText.textContent = "Connection lost during restore";
              btnRestore.disabled = false;
              btnRestore.textContent = "Restore";
            });
          } else {
            // CSV restore returned synchronously
            if (data.success) {
              modal.alert("Restore Complete", "Data has been restored successfully.", "success");
            } else {
              modal.alert("Restore Failed", data.message || "Unknown error", "danger");
            }
            btnRestore.disabled = false;
            btnRestore.textContent = "Restore";
          }
        })
        .catch((err) => {
          modal.alert("Error", `Restore failed: ${err}`, "danger");
          btnRestore.disabled = false;
          btnRestore.textContent = "Restore";
        });
    });
  });

  // ── Topics ─────────────────────────────────────────────────────

  var topicsList = document.getElementById("topics-list");

  function refreshTopics() {
    fetch(`${API}/api/topics`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.topics?.length) {
          topicsList.innerHTML = '<p class="empty-msg">No topics found.</p>';
          return;
        }
        topicsList.innerHTML = data.topics
          .map(
            (t) =>
              '<div class="ops-topic-row">' +
              '<span class="ops-topic-name">' +
              esc(t.name) +
              "</span>" +
              '<span class="ops-topic-meta">partitions: ' +
              t.partitions +
              " | replicas: " +
              t.replicas +
              "</span>" +
              "</div>",
          )
          .join("");
      })
      .catch(() => {
        topicsList.innerHTML = '<p class="empty-msg">Could not load topics.</p>';
      });
  }

  // ── Init ───────────────────────────────────────────────────────

  refreshHealth();
  refreshReplication();
  refreshReplicaStatus();
  refreshBackupList();
  refreshTopics();

  setInterval(() => {
    refreshHealth();
    refreshReplication();
    refreshReplicaStatus();
  }, 5000);

  setInterval(refreshBackupList, 30000);
})();
