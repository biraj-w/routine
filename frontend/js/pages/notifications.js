/**
 * Notifications.
 *
 * The inbox is pinned server-side to the signed-in user, so there is no filter to
 * get wrong here — no role can read another account's notifications.
 */
(function () {
  "use strict";

  if (!window.Auth.requirePermission(window.PERM.VIEW_NOTIFICATIONS)) return;

  const { el, toast, badge } = window.UI;

  const state = { unreadOnly: false, page: 1 };

  const content = window.Layout.mount({
    title: "Notifications",
    subtitle: "Routine submissions, approvals and publications that affect you.",
    actions: [
      el("button", {
        class: "btn ghost",
        type: "button",
        text: "Mark all as read",
        onClick: async () => {
          try {
            const { data } = await window.Api.patch("/notifications/read-all");
            toast(data.updated ? `${data.updated} marked as read` : "Nothing unread", "success");
            window.Layout.pollUnread();
            load();
          } catch (err) {
            toast(err.message, "error");
          }
        },
      }),
    ],
  });

  const toggle = el("button", {
    class: "btn ghost small",
    type: "button",
    text: "Show unread only",
    onClick: () => {
      state.unreadOnly = !state.unreadOnly;
      state.page = 1;
      toggle.textContent = state.unreadOnly ? "Show all" : "Show unread only";
      load();
    },
  });

  const host = el("div", { class: "table-host" });
  window.UI.render(
    content,
    el("div", { class: "toolbar" }, [
      el("div", { class: "toolbar-left" }, [toggle]),
      el("div", { class: "toolbar-right" }, [el("span", { class: "result-count", id: "count" })]),
    ]),
    host
  );

  const TONE = {
    ROUTINE_SUBMITTED: "warning",
    ROUTINE_APPROVED: "info",
    ROUTINE_REJECTED: "danger",
    ROUTINE_PUBLISHED: "success",
    ROUTINE_UPDATED: "primary",
    ACCOUNT: "neutral",
    SYSTEM: "neutral",
  };

  async function markRead(notification, row) {
    try {
      await window.Api.patch(`/notifications/${notification.id}/read`);
      row.classList.remove("is-unread");
      window.Layout.pollUnread();
    } catch {
      /* a failed mark-as-read is not worth interrupting the user */
    }
  }

  async function load() {
    window.UI.render(host, window.UI.spinner("Loading notifications…"));

    try {
      const { data, meta } = await window.Api.get("/notifications", {
        page: state.page,
        limit: 20,
        unread: state.unreadOnly ? "true" : undefined,
      });

      const count = document.getElementById("count");
      if (count) count.textContent = `${meta.unreadCount || 0} unread`;

      if (!data.length) {
        window.UI.render(
          host,
          window.UI.emptyState(state.unreadOnly ? "Nothing unread." : "No notifications yet.")
        );
        return;
      }

      const list = el("ul", { class: "schedule-list" });
      data.forEach((n) => {
        const row = el("li", { class: `schedule-item${n.isRead ? "" : " is-unread is-upcoming"}` }, [
          badge(n.type.replace(/^ROUTINE_/, "").toLowerCase(), TONE[n.type] || "neutral"),
          el("div", { class: "schedule-main" }, [
            el("span", { class: "schedule-course", text: n.title }),
            el("span", { class: "schedule-meta", text: n.message }),
          ]),
          el("span", { class: "schedule-time", text: window.Fmt.relative(n.createdAt) }),
          n.link
            ? el("a", {
                class: "btn tiny ghost",
                href: n.link,
                text: "Open",
                onClick: () => {
                  if (!n.isRead) markRead(n, row);
                },
              })
            : null,
          !n.isRead
            ? el("button", {
                class: "btn tiny ghost",
                type: "button",
                text: "Mark read",
                onClick: (event) => {
                  event.currentTarget.remove();
                  markRead(n, row);
                },
              })
            : null,
        ].filter(Boolean));
        list.appendChild(row);
      });

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
              el("span", { class: "page-info", text: `Page ${meta.page} of ${meta.totalPages}` }),
            ])
          : null;

      window.UI.render(host, list, pager);
    } catch (err) {
      window.UI.render(host, window.UI.errorState(err.message, load));
    }
  }

  load();
})();
