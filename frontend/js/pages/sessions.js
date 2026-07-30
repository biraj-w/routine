/**
 * Active devices.
 *
 * This page exists to make session management VISIBLE. A stateless JWT alone
 * cannot be revoked, so the server keeps a session row per sign-in and checks it
 * on every request — which is what lets a device be signed out from here and stop
 * working immediately, rather than whenever its token happened to expire.
 */
(function () {
  "use strict";

  if (!window.Auth.requireAuth()) return;

  const { el, toast, badge } = window.UI;

  const content = window.Layout.mount({
    title: "Devices",
    subtitle: "Everywhere your account is currently signed in. Revoking a device takes effect on its next request.",
    actions: [
      el("button", {
        class: "btn danger-ghost",
        type: "button",
        text: "Sign out everywhere",
        onClick: async () => {
          const confirmed = await window.UI.confirmDialog({
            title: "Sign out of every device?",
            message: "This ends all your sessions, including this one. You will need to sign in again.",
            confirmLabel: "Sign out everywhere",
          });
          if (!confirmed) return;

          try {
            await window.Api.post("/auth/logout-all");
            window.Auth.clear();
            window.location.replace("login.html");
          } catch (err) {
            toast(err.message, "error");
          }
        },
      }),
    ],
  });

  const host = el("div", { class: "table-host" });
  window.UI.render(content, host);

  async function revoke(session) {
    const confirmed = await window.UI.confirmDialog({
      title: "Sign out this device?",
      message: `${window.Fmt.device(session.userAgent)} will be signed out immediately.`,
      confirmLabel: "Sign out",
    });
    if (!confirmed) return;

    try {
      await window.Api.del(`/auth/sessions/${session.id}`);
      toast("Device signed out", "success");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function load() {
    window.UI.render(host, window.UI.spinner("Loading devices…"));

    try {
      const { data } = await window.Api.get("/auth/sessions");

      if (!data.length) {
        window.UI.render(host, window.UI.emptyState("No active sessions."));
        return;
      }

      const table = el("table", { class: "data-table" });
      table.appendChild(
        el("thead", {}, [
          el("tr", {}, [
            el("th", { text: "Device" }),
            el("th", { text: "IP address" }),
            el("th", { text: "Last used" }),
            el("th", { text: "Signed in" }),
            el("th", { text: "Expires" }),
            el("th", { class: "align-right", text: "" }),
          ]),
        ])
      );
      table.appendChild(
        el(
          "tbody",
          {},
          data.map((s) =>
            el("tr", {}, [
              el("td", {}, [
                el("span", { text: window.Fmt.device(s.userAgent) }),
                s.isCurrent ? el("span", { text: " " }) : null,
                s.isCurrent ? badge("This device", "success") : null,
              ].filter(Boolean)),
              el("td", { class: "mono", text: s.ipAddress || "—" }),
              el("td", { text: window.Fmt.relative(s.lastUsedAt) }),
              el("td", { text: window.Fmt.dateTime(s.createdAt) }),
              el("td", { text: window.Fmt.date(s.expiresAt) }),
              el("td", { class: "align-right" }, [
                // The current device is signed out via the header, not from here,
                // so the two paths do not both try to redirect.
                s.isCurrent
                  ? el("span", { class: "small muted", text: "—" })
                  : el("button", {
                      class: "btn tiny danger-ghost",
                      type: "button",
                      text: "Sign out",
                      onClick: () => revoke(s),
                    }),
              ]),
            ])
          )
        )
      );

      window.UI.render(host, el("div", { class: "table-scroll" }, [table]));
    } catch (err) {
      window.UI.render(host, window.UI.errorState(err.message, load));
    }
  }

  load();
})();
