/**
 * Shared modal system — replaces alert() and confirm() with styled modals.
 *
 * Usage:
 *   modal.alert("Something happened");
 *   modal.alert("Title", "Detailed message");
 *   modal.confirm("Are you sure?").then(function (ok) { if (ok) doThing(); });
 *   modal.confirm("Delete item", "This cannot be undone.", "danger").then(...)
 */
window.modal = (() => {
  function _esc(s) {
    if (!s) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function create(title, body, buttons) {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    var box = document.createElement("div");
    box.className = "modal-box";

    if (title) {
      var titleEl = document.createElement("div");
      titleEl.className = "modal-title";
      titleEl.textContent = title;
      box.appendChild(titleEl);
    }

    if (body) {
      var bodyEl = document.createElement("div");
      bodyEl.className = "modal-body";
      bodyEl.textContent = body;
      box.appendChild(bodyEl);
    }

    var actions = document.createElement("div");
    actions.className = "modal-actions";

    buttons.forEach((b) => {
      var btn = document.createElement("button");
      btn.className = `modal-btn ${b.cls || "modal-btn-ok"}`;
      btn.textContent = b.label;
      btn.addEventListener("click", () => {
        overlay.remove();
        if (b.cb) b.cb();
      });
      actions.appendChild(btn);
    });

    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Close on overlay click (outside box)
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        // Call the cancel callback if there's one
        var cancelBtn = buttons.find((b) => b.cls && b.cls.indexOf("cancel") !== -1);
        if (cancelBtn?.cb) cancelBtn.cb();
      }
    });

    // Close on Escape key
    function onKey(e) {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
        var cancelBtn = buttons.find((b) => b.cls && b.cls.indexOf("cancel") !== -1);
        if (cancelBtn?.cb) cancelBtn.cb();
      }
    }
    document.addEventListener("keydown", onKey);

    // Focus first action button
    var first = actions.querySelector("button");
    if (first) first.focus();

    return overlay;
  }

  /**
   * modal.alert(message)
   * modal.alert(title, message)
   * modal.alert(title, message, "success" | "danger")
   * Returns a Promise that resolves when dismissed.
   */
  function modalAlert(titleOrMsg, msg, style) {
    var title, body;
    if (msg === undefined) {
      title = "";
      body = titleOrMsg;
    } else {
      title = titleOrMsg;
      body = msg;
    }
    var btnCls = style === "danger" ? "modal-btn-danger" : style === "success" ? "modal-btn-success" : "modal-btn-ok";

    return new Promise((resolve) => {
      create(title, body, [{ label: "OK", cls: btnCls, cb: resolve }]);
    });
  }

  /**
   * modal.confirm(message)
   * modal.confirm(title, message)
   * modal.confirm(title, message, "danger")
   * Returns a Promise<boolean>.
   */
  function modalConfirm(titleOrMsg, msg, style) {
    var title, body;
    if (msg === undefined) {
      title = "";
      body = titleOrMsg;
    } else {
      title = titleOrMsg;
      body = msg;
    }
    var okCls = style === "danger" ? "modal-btn-danger" : "modal-btn-ok";

    return new Promise((resolve) => {
      create(title, body, [
        {
          label: "Cancel",
          cls: "modal-btn-cancel",
          cb: () => {
            resolve(false);
          },
        },
        {
          label: style === "danger" ? "Confirm" : "OK",
          cls: okCls,
          cb: () => {
            resolve(true);
          },
        },
      ]);
    });
  }

  return { alert: modalAlert, confirm: modalConfirm };
})();
