/**
 * Activity log — read-only audit trail.
 *
 * Department-scoped by the server, so a Department Admin sees their own
 * department's history and a Super Admin sees everything. There is no write
 * endpoint: entries appear only as a side effect of real actions, which is what
 * makes the trail worth trusting.
 *
 * Actor details are snapshots taken at the time, so a row stays readable after an
 * account is renamed or deactivated, and shows the role the user held then.
 */
(function () {
  "use strict";

  if (!window.Auth.requirePermission(window.PERM.VIEW_ACTIVITY_LOGS)) return;

  const { el, badge } = window.UI;

  const ACTIONS = [
    "LOGIN", "LOGIN_FAILED", "LOGOUT",
    "CREATE", "UPDATE", "DELETE",
    "SUBMIT", "APPROVE", "REJECT", "PUBLISH",
    "PASSWORD_CHANGE", "PASSWORD_RESET", "PERMISSION_CHANGE",
  ];

  const TONE = {
    LOGIN: "success",
    LOGOUT: "neutral",
    LOGIN_FAILED: "danger",
    CREATE: "success",
    UPDATE: "primary",
    DELETE: "danger",
    SUBMIT: "warning",
    APPROVE: "info",
    REJECT: "danger",
    PUBLISH: "success",
    PASSWORD_CHANGE: "warning",
    PASSWORD_RESET: "warning",
    PERMISSION_CHANGE: "danger",
  };

  const state = { page: 1, action: "", search: "" };

  const content = window.Layout.mount({
    title: "Activity log",
    subtitle: "Who did what, and when. Append-only — entries cannot be edited or removed through the application.",
  });

  const actionFilter = el("select", { class: "filter-select", "aria-label": "Action" });
  actionFilter.appendChild(el("option", { value: "", text: "All actions" }));
  ACTIONS.forEach((a) => actionFilter.appendChild(el("option", { value: a, text: a.replace(/_/g, " ").toLowerCase() })));
  actionFilter.addEventListener("change", (event) => {
    state.action = event.target.value;
    state.page = 1;
    load();
  });

  const searchInput = el("input", {
    type: "search",
    class: "search-input",
    placeholder: "Search actor or description…",
    "aria-label": "Search the activity log",
    onInput: window.UI.debounce((event) => {
      state.search = event.target.value.trim();
      state.page = 1;
      load();
    }, 350),
  });

  const host = el("div", { class: "table-host" });
  window.UI.render(
    content,
    el("div", { class: "toolbar" }, [
      el("div", { class: "toolbar-left" }, [searchInput, actionFilter]),
      el("div", { class: "toolbar-right" }, [el("span", { class: "result-count", id: "count" })]),
    ]),
    host
  );

  /** Render a changed-field diff compactly. Only changed fields are stored. */
  function changeSummary(changes) {
    const after = changes?.after;
    if (!after || typeof after !== "object" || !Object.keys(after).length) return null;

    const parts = Object.keys(after).slice(0, 4).map((key) => {
      const from = changes.before?.[key];
      const to = after[key];
      const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : String(v).slice(0, 30));
      return `${key}: ${fmt(from)} → ${fmt(to)}`;
    });
    if (Object.keys(after).length > 4) parts.push(`+${Object.keys(after).length - 4} more`);

    return el("span", { class: "small muted mono", text: parts.join(" · ") });
  }

  async function load() {
    window.UI.render(host, window.UI.spinner("Loading activity…"));

    try {
      const { data, meta } = await window.Api.get("/activity-logs", {
        page: state.page,
        limit: 30,
        action: state.action || undefined,
        search: state.search || undefined,
      });

      const count = document.getElementById("count");
      if (count) count.textContent = `${meta.total} entries`;

      if (!data.length) {
        window.UI.render(host, window.UI.emptyState("No activity recorded for these filters."));
        return;
      }

      const table = el("table", { class: "data-table" });
      table.appendChild(
        el("thead", {}, [
          el("tr", {}, [
            el("th", { text: "When" }),
            el("th", { text: "Action" }),
            el("th", { text: "Actor" }),
            el("th", { text: "What happened" }),
            el("th", { text: "Entity" }),
          ]),
        ])
      );
      table.appendChild(
        el(
          "tbody",
          {},
          data.map((row) =>
            el("tr", {}, [
              el("td", { class: "nowrap", title: window.Fmt.dateTime(row.createdAt), text: window.Fmt.relative(row.createdAt) }),
              el("td", {}, [
                badge(row.action.replace(/_/g, " ").toLowerCase(), TONE[row.action] || "neutral"),
                row.status === "FAILURE" ? el("span", { class: "small", text: " failed" }) : null,
              ].filter(Boolean)),
              el("td", {}, [
                el("span", { text: row.actorName || row.actorEmail || "—" }),
                row.actorRole ? el("small", { class: "muted", text: ` · ${row.actorRole}` }) : null,
              ].filter(Boolean)),
              el("td", {}, [
                el("span", { text: row.description || "—" }),
                changeSummary(row.changes) ? el("br") : null,
                changeSummary(row.changes),
              ].filter(Boolean)),
              el("td", { class: "small muted", text: row.entityType || "—" }),
            ])
          )
        )
      );

      const pager =
        meta.totalPages > 1
          ? el("div", { class: "pagination" }, [
              el("div", { class: "page-buttons" }, [
                el("button", {
                  class: "page-button", type: "button", text: "‹ Prev", disabled: !meta.hasPrev,
                  onClick: () => { state.page -= 1; load(); },
                }),
                el("button", {
                  class: "page-button", type: "button", text: "Next ›", disabled: !meta.hasNext,
                  onClick: () => { state.page += 1; load(); },
                }),
              ]),
              el("span", { class: "page-info", text: `Page ${meta.page} of ${meta.totalPages} · ${meta.total} entries` }),
            ])
          : null;

      window.UI.render(host, el("div", { class: "table-scroll" }, [table]), pager);
    } catch (err) {
      window.UI.render(host, window.UI.errorState(err.message, load));
    }
  }

  load();
})();
