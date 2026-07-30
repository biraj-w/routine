/**
 * The application shell: header, sidebar, main region. Attached to window.Layout.
 *
 * Every protected page is a near-empty HTML file containing `<div id="app">`.
 * Layout.mount() injects the chrome, so the nav exists once in the codebase
 * instead of once per page.
 *
 * ── Role-aware UI, declaratively ───────────────────────────────────────────
 * Two mechanisms, and no `if (role === ...)` in any page script:
 *
 *   1. The sidebar is generated from config/nav.js and filtered by permission.
 *   2. Any element carrying data-permission / data-permission-any / data-role is
 *      REMOVED if the user lacks it.
 *
 * Removed, not hidden. A `display:none` button is still in the DOM and can still
 * be clicked from the console, so hiding it would imply a protection it does not
 * provide. (The real protection is the server's check; this is presentation.)
 */
(function () {
  "use strict";

  const { el } = window.UI;

  /** Strip elements the user has no permission for. Re-run after every render. */
  function applyPermissions(root = document) {
    root.querySelectorAll("[data-permission]").forEach((node) => {
      if (!window.Auth.hasPermission(node.dataset.permission)) node.remove();
    });
    root.querySelectorAll("[data-permission-any]").forEach((node) => {
      const list = node.dataset.permissionAny.split(",").map((s) => s.trim());
      if (!window.Auth.hasAnyPermission(list)) node.remove();
    });
    root.querySelectorAll("[data-role]").forEach((node) => {
      if (!window.Auth.hasRole(node.dataset.role)) node.remove();
    });
  }

  function currentPage() {
    return window.location.pathname.split("/").pop() || "dashboard.html";
  }

  function buildSidebar() {
    const here = currentPage();
    const nav = el("nav", { class: "sidebar-nav", "aria-label": "Main navigation" });

    window.NAV.forEach((group) => {
      const visible = group.items.filter(
        (item) => !item.permission || window.Auth.hasAnyPermission(item.permission)
      );
      // A section whose every item is hidden must not leave a stray heading.
      if (!visible.length) return;

      nav.appendChild(el("p", { class: "nav-section", text: group.section }));
      visible.forEach((item) => {
        nav.appendChild(
          el(
            "a",
            {
              class: `nav-link${item.href === here ? " is-active" : ""}`,
              href: item.href,
              "aria-current": item.href === here ? "page" : null,
            },
            [el("span", { class: "nav-icon", "aria-hidden": "true", text: item.icon || "•" }), item.label]
          )
        );
      });
    });

    return el("aside", { class: "sidebar" }, [
      el("div", { class: "brand" }, [
        el("span", { class: "brand-mark", "aria-hidden": "true", text: "◴" }),
        el("span", { class: "brand-text" }, [
          el("strong", { text: "Routine" }),
          el("small", { text: "Management System" }),
        ]),
      ]),
      nav,
    ]);
  }

  function buildHeader(pageTitle) {
    const user = window.Auth.getUser();

    const bell = el(
      "a",
      { class: "icon-button", href: "notifications.html", "aria-label": "Notifications", title: "Notifications" },
      [
        el("span", { "aria-hidden": "true", text: "◈" }),
        el("span", { class: "badge-dot", id: "unread-dot", hidden: true }),
      ]
    );

    return el("header", { class: "topbar" }, [
      el("button", {
        class: "icon-button sidebar-toggle",
        type: "button",
        "aria-label": "Toggle navigation",
        text: "☰",
        onClick: () => document.body.classList.toggle("sidebar-open"),
      }),
      el("h1", { class: "page-title", id: "page-title", text: pageTitle || "" }),
      el("div", { class: "topbar-right" }, [
        bell,
        el("div", { class: "user-chip" }, [
          el("span", { class: "user-name", text: user?.name || "—" }),
          el("span", { class: "user-role", text: user?.role?.name || "" }),
          user?.department?.code && el("span", { class: "user-dept", text: user.department.code }),
        ]),
        el("button", {
          class: "btn ghost small",
          type: "button",
          text: "Sign out",
          onClick: () => window.Auth.logout(),
        }),
      ]),
    ]);
  }

  /**
   * Build the shell and return the <main> element for the page to fill.
   *
   * @param {Object} options
   * @param {string} options.title
   * @param {string} [options.subtitle]
   * @param {Array}  [options.actions]  buttons for the page header
   */
  function mount({ title, subtitle = "", actions = [] } = {}) {
    const app = document.getElementById("app");
    if (!app) throw new Error('layout.mount(): no <div id="app"> on this page');

    document.title = title ? `${title} · Routine Management` : "Routine Management";

    const content = el("div", { class: "content", id: "content" });

    const pageHead = el("div", { class: "page-head" }, [
      el("div", {}, [
        el("h2", { class: "page-heading", text: title || "" }),
        subtitle && el("p", { class: "page-subtitle", text: subtitle }),
      ]),
      actions.length ? el("div", { class: "page-actions" }, actions) : null,
    ]);

    window.UI.render(
      app,
      buildSidebar(),
      el("div", { class: "shell" }, [
        buildHeader(title),
        el("main", { class: "main" }, [pageHead, content]),
        el("footer", { class: "footer" }, [
          el("span", { text: "University Routine Management System" }),
        ]),
      ])
    );

    // Applied after the shell exists, so data-permission attributes in the
    // page's own static markup are honoured too.
    applyPermissions(document);
    window.UI.showFlash();
    pollUnread();

    return content;
  }

  /** Unread badge. Failure is silent — a missing dot must not break a page. */
  async function pollUnread() {
    if (!window.Auth.hasPermission(window.PERM.VIEW_NOTIFICATIONS)) return;
    try {
      const { data } = await window.Api.get("/notifications/unread-count");
      const dot = document.getElementById("unread-dot");
      if (dot) dot.hidden = !data?.unreadCount;
    } catch {
      /* ignore */
    }
  }

  /** Convenience: a primary action button gated by permission. */
  function actionButton({ label, permission, onClick, variant = "primary" }) {
    if (permission && !window.Auth.hasPermission(permission)) return null;
    return el("button", { class: `btn ${variant}`, type: "button", text: label, onClick });
  }

  window.Layout = { mount, applyPermissions, actionButton, pollUnread };
})();
