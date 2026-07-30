/**
 * DOM building and UI primitives. Attached to window.UI.
 *
 * ── el() and why it matters ────────────────────────────────────────────────
 * The previous version of this project built every table row by interpolating
 * server data into an HTML string:
 *
 *     tr.innerHTML = `<td>${r.name}</td>`;
 *
 * A student named `<img src=x onerror=alert(1)>` would then execute script in
 * every administrator's browser — stored XSS, delivered by the API's own data.
 *
 * el() creates real nodes and assigns text through `textContent`, which cannot
 * be parsed as markup. Combined with addEventListener instead of inline
 * `onclick=`, the injection surface is removed rather than filtered.
 */
(function () {
  "use strict";

  /**
   * Create an element.
   *
   *   el("td", { text: student.name })
   *   el("button", { class: "btn primary", onClick: save }, ["Save"])
   *   el("input", { type: "text", value: v, dataset: { field: "code" } })
   *
   * Children may be nodes, strings (appended as TEXT, never markup), or falsy
   * values, which are skipped so `cond && el(...)` reads naturally.
   */
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);

    Object.entries(props).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;

      if (key === "text") {
        node.textContent = String(value);
      } else if (key === "class" || key === "className") {
        node.className = value;
      } else if (key === "html") {
        // Escape hatch for trusted, code-authored markup only (e.g. an icon).
        // Never pass server data here.
        node.innerHTML = value;
      } else if (key === "dataset") {
        Object.entries(value).forEach(([k, v]) => {
          if (v !== undefined && v !== null) node.dataset[k] = v;
        });
      } else if (key === "style" && typeof value === "object") {
        Object.assign(node.style, value);
      } else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in node && key !== "list") {
        node[key] = value;
      } else {
        node.setAttribute(key, value);
      }
    });

    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    });

    return node;
  }

  /** Replace a container's contents with the given nodes. */
  function render(container, ...nodes) {
    container.textContent = "";
    nodes.flat().forEach((n) => n && container.appendChild(n));
    return container;
  }

  /* ── Toasts ─────────────────────────────────────────────────────────────── */

  function toastHost() {
    let host = document.getElementById("toast-host");
    if (!host) {
      host = el("div", { id: "toast-host", class: "toast-host" });
      document.body.appendChild(host);
    }
    return host;
  }

  /** @param {"success"|"error"|"warning"|"info"} type */
  function toast(message, type = "info", timeout = 4500) {
    const node = el("div", { class: `toast toast-${type}`, role: "status" }, [
      el("span", { class: "toast-message", text: message }),
      el("button", {
        class: "toast-close",
        type: "button",
        "aria-label": "Dismiss",
        text: "×",
        onClick: () => node.remove(),
      }),
    ]);
    toastHost().appendChild(node);
    if (timeout) setTimeout(() => node.remove(), timeout);
    return node;
  }

  /**
   * Show a one-shot message stored before a redirect.
   * Used by Auth.requirePermission, which cannot toast on a page it is leaving.
   */
  function showFlash() {
    const raw = sessionStorage.getItem("rms.flash");
    if (!raw) return;
    sessionStorage.removeItem("rms.flash");
    try {
      const { type, message } = JSON.parse(raw);
      toast(message, type || "info");
    } catch {
      /* ignore malformed flash */
    }
  }

  /* ── Modal ──────────────────────────────────────────────────────────────── */

  /**
   * Open a modal. Returns { close }.
   *
   * Escape closes, as does clicking the backdrop. Focus moves to the first
   * field so a keyboard user is not stranded.
   */
  function modal({ title, body, footer, onClose, wide = false }) {
    const backdrop = el("div", { class: "modal-backdrop" });
    const dialog = el("div", {
      class: `modal${wide ? " modal-wide" : ""}`,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title || "Dialog",
    });

    function close() {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      if (onClose) onClose();
    }

    function onKey(event) {
      if (event.key === "Escape") close();
    }

    dialog.appendChild(
      el("div", { class: "modal-header" }, [
        el("h3", { class: "modal-title", text: title || "" }),
        el("button", {
          class: "modal-close",
          type: "button",
          "aria-label": "Close",
          text: "×",
          onClick: close,
        }),
      ])
    );
    dialog.appendChild(el("div", { class: "modal-body" }, [body]));
    if (footer) dialog.appendChild(el("div", { class: "modal-footer" }, [footer]));

    backdrop.appendChild(dialog);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(backdrop);

    const first = dialog.querySelector("input, select, textarea, button");
    if (first) first.focus();

    return { close, dialog, backdrop };
  }

  /** Promise-based confirmation. Replaces window.confirm, which cannot be styled. */
  function confirmDialog({ title = "Are you sure?", message, confirmLabel = "Confirm", danger = true }) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        handle.close();
        resolve(value);
      };

      const handle = modal({
        title,
        body: el("p", { class: "confirm-message", text: message }),
        footer: el("div", { class: "modal-actions" }, [
          el("button", { class: "btn ghost", type: "button", text: "Cancel", onClick: () => finish(false) }),
          el("button", {
            class: `btn ${danger ? "danger" : "primary"}`,
            type: "button",
            text: confirmLabel,
            onClick: () => finish(true),
          }),
        ]),
        onClose: () => finish(false),
      });
    });
  }

  /* ── States ─────────────────────────────────────────────────────────────── */

  const spinner = (label = "Loading…") =>
    el("div", { class: "state state-loading" }, [
      el("div", { class: "spinner", "aria-hidden": "true" }),
      el("p", { text: label }),
    ]);

  const emptyState = (message = "Nothing to show yet.", action = null) =>
    el("div", { class: "state state-empty" }, [el("p", { text: message }), action]);

  const errorState = (message, onRetry = null) =>
    el("div", { class: "state state-error" }, [
      el("p", { text: message }),
      onRetry && el("button", { class: "btn ghost", type: "button", text: "Try again", onClick: onRetry }),
    ]);

  const badge = (text, tone = "neutral") => el("span", { class: `badge badge-${tone}`, text });

  /* ── Forms ──────────────────────────────────────────────────────────────── */

  /**
   * Build a form from field descriptors.
   *
   * A field is:
   *   { name, label, type, required, options, resource, labelKey, help,
   *     min, max, step, rows, placeholder, default, readOnly }
   *
   * type "ref" renders a <select> whose options come from `resource`; the caller
   * supplies the already-fetched list via `field.options` (crud.js caches them,
   * so eight pages do not each refetch the department list).
   */
  function buildForm(fields, values = {}) {
    const form = el("form", { class: "form", novalidate: true });

    fields.forEach((field) => {
      const value = values[field.name] !== undefined ? values[field.name] : field.default;
      const id = `field-${field.name.replace(/\./g, "-")}`;

      const group = el("div", { class: `form-group${field.wide ? " form-group-wide" : ""}` });

      if (field.type !== "checkbox") {
        group.appendChild(
          el("label", { for: id, text: field.label + (field.required ? " *" : "") })
        );
      }

      let input;
      switch (field.type) {
        case "select":
        case "ref": {
          input = el("select", { id, name: field.name, required: field.required });
          input.appendChild(el("option", { value: "", text: field.placeholder || "— select —" }));
          (field.options || []).forEach((opt) => {
            const optValue = typeof opt === "string" ? opt : window.Fmt.idOf(opt);
            const optLabel =
              typeof opt === "string"
                ? opt
                : opt.label || window.Fmt.labelOf(opt, field.labelKey || "name");
            input.appendChild(
              el("option", {
                value: optValue,
                text: optLabel,
                // idOf handles a populated object arriving as the current value.
                selected: String(window.Fmt.idOf(value) || value || "") === String(optValue),
              })
            );
          });
          break;
        }

        case "checkbox": {
          input = el("input", { id, name: field.name, type: "checkbox", checked: Boolean(value) });
          group.appendChild(
            el("label", { class: "checkbox-label", for: id }, [input, ` ${field.label}`])
          );
          break;
        }

        case "textarea":
          input = el("textarea", {
            id,
            name: field.name,
            rows: field.rows || 3,
            required: field.required,
            value: value ?? "",
            placeholder: field.placeholder || "",
          });
          break;

        case "date":
          input = el("input", {
            id,
            name: field.name,
            type: "date",
            required: field.required,
            // <input type=date> needs YYYY-MM-DD, not an ISO timestamp.
            value: value ? String(value).slice(0, 10) : "",
          });
          break;

        case "multi": {
          // Comma-separated list, e.g. section labels. Simpler than a tag widget
          // and adequate for short lists.
          input = el("input", {
            id,
            name: field.name,
            type: "text",
            required: field.required,
            value: Array.isArray(value) ? value.join(", ") : value ?? "",
            placeholder: field.placeholder || "A, B, C",
          });
          input.dataset.multi = "true";
          break;
        }

        default:
          input = el("input", {
            id,
            name: field.name,
            type: field.type || "text",
            required: field.required,
            value: value ?? "",
            placeholder: field.placeholder || "",
            min: field.min,
            max: field.max,
            step: field.step,
            readOnly: field.readOnly,
            autocomplete: field.autocomplete,
          });
      }

      if (field.type !== "checkbox") group.appendChild(input);
      if (field.help) group.appendChild(el("small", { class: "form-help", text: field.help }));
      // Per-field error slot, filled by showFieldErrors.
      group.appendChild(el("small", { class: "field-error", dataset: { errorFor: field.name } }));

      form.appendChild(group);
    });

    return form;
  }

  /** Read a form into a plain object, converting types back. */
  function readForm(form, fields = []) {
    const out = {};
    const byName = new Map(fields.map((f) => [f.name, f]));

    new FormData(form).forEach((value, key) => {
      const field = byName.get(key);
      if (field?.type === "number") {
        out[key] = value === "" ? null : Number(value);
      } else if (field?.type === "multi") {
        out[key] = String(value)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        out[key] = typeof value === "string" ? value.trim() : value;
      }
    });

    // FormData omits unchecked boxes entirely, so booleans are read directly.
    fields
      .filter((f) => f.type === "checkbox")
      .forEach((f) => {
        const input = form.querySelector(`[name="${f.name}"]`);
        out[f.name] = Boolean(input?.checked);
      });

    return out;
  }

  /**
   * Pin server-side validation errors to their inputs.
   * The API returns errors as [{ field, message }] for exactly this purpose.
   */
  function showFieldErrors(form, errors = []) {
    clearFieldErrors(form);
    let firstBad = null;

    errors.forEach(({ field, message }) => {
      const slot = form.querySelector(`[data-error-for="${field}"]`);
      const input = form.querySelector(`[name="${field}"]`);
      if (slot) slot.textContent = message;
      if (input) {
        input.classList.add("is-invalid");
        if (!firstBad) firstBad = input;
      }
    });

    if (firstBad) firstBad.focus();
    // Anything without a matching input still has to be visible somewhere.
    const orphans = errors.filter((e) => !form.querySelector(`[data-error-for="${e.field}"]`));
    if (orphans.length) toast(orphans.map((o) => o.message).join(" "), "error");
  }

  function clearFieldErrors(form) {
    form.querySelectorAll(".field-error").forEach((n) => {
      n.textContent = "";
    });
    form.querySelectorAll(".is-invalid").forEach((n) => n.classList.remove("is-invalid"));
  }

  /** Inline alert list, used for routine conflicts and warnings. */
  function alertList(items, tone = "error", heading = null) {
    if (!items?.length) return null;
    return el("div", { class: `alert alert-${tone}` }, [
      heading && el("strong", { text: heading }),
      el(
        "ul",
        {},
        items.map((item) => el("li", { text: typeof item === "string" ? item : item.message }))
      ),
    ]);
  }

  /** Disable a submit button while a request is in flight. */
  function busy(button, isBusy, busyLabel = "Saving…") {
    if (!button) return;
    if (isBusy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = busyLabel;
      button.disabled = true;
    } else {
      if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
      button.disabled = false;
    }
  }

  /** Trailing debounce, for search-as-you-type. */
  function debounce(fn, wait = 300) {
    let timer;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  window.UI = {
    el, render,
    toast, showFlash,
    modal, confirmDialog,
    spinner, emptyState, errorState, badge,
    buildForm, readForm, showFieldErrors, clearFieldErrors, alertList, busy,
    debounce,
  };
})();
