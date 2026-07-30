/**
 * Profile — own details, password change, and the permissions this account holds.
 *
 * The permission list is shown deliberately. It makes the RBAC model visible, and
 * it is the quickest way to see why a menu item is missing for one role and
 * present for another.
 *
 * Only name and phone can be edited. Role, department and status are absent
 * because the server ignores them here — offering the fields would imply
 * otherwise.
 */
(function () {
  "use strict";

  if (!window.Auth.requireAuth()) return;

  const { el, toast, badge } = window.UI;
  const params = new URLSearchParams(window.location.search);

  const content = window.Layout.mount({
    title: "Profile",
    subtitle: "Your account details and the permissions attached to your role.",
  });

  window.UI.render(content, window.UI.spinner("Loading profile…"));

  function detailCard(user) {
    const rows = [
      ["Name", user.name],
      ["Email", user.email],
      ["Role", user.role?.name],
      ["Data scope", user.role?.dataScope],
      ["Department", user.department ? `${user.department.name} (${user.department.code})` : "Institution-wide"],
      ["Status", window.Fmt.titleCase(user.status)],
      ["Last signed in", window.Fmt.dateTime(user.lastLoginAt)],
    ];

    if (user.profile) {
      rows.push([
        "Linked profile",
        user.profile.employeeCode
          ? `Teacher · ${user.profile.employeeCode}`
          : `Student · ${user.profile.rollNo}, section ${user.profile.section}`,
      ]);
    }

    const list = el("dl", { class: "detail-list" });
    rows.forEach(([label, value]) => {
      list.appendChild(el("dt", { text: label }));
      list.appendChild(el("dd", { text: value || "—" }));
    });

    return el("section", { class: "card" }, [
      el("div", { class: "card-head" }, [el("h3", { class: "card-title", text: "Account" })]),
      el("div", { class: "card-body" }, [list]),
    ]);
  }

  function editCard(user) {
    const fields = [
      { name: "name", label: "Full name", type: "text", required: true },
      { name: "phone", label: "Phone", type: "tel" },
    ];
    const form = window.UI.buildForm(fields, { name: user.name, phone: user.phone });
    const submit = el("button", { class: "btn primary", type: "submit", text: "Save changes" });
    form.appendChild(el("div", { class: "form-actions" }, [submit]));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      window.UI.clearFieldErrors(form);
      window.UI.busy(submit, true);

      try {
        const { data } = await window.Api.patch("/auth/profile", window.UI.readForm(form, fields));
        window.Auth.saveSession({ user: data.user });
        toast("Profile updated", "success");
        // The header shows the name, so it has to be rebuilt.
        window.location.reload();
      } catch (err) {
        if (err.isValidation) window.UI.showFieldErrors(form, err.errors);
        else toast(err.message, "error");
      } finally {
        window.UI.busy(submit, false);
      }
    });

    return el("section", { class: "card" }, [
      el("div", { class: "card-head" }, [el("h3", { class: "card-title", text: "Edit details" })]),
      el("div", { class: "card-body" }, [form]),
    ]);
  }

  function passwordCard(user) {
    const fields = [
      { name: "currentPassword", label: "Current password", type: "password", required: true, autocomplete: "current-password" },
      { name: "newPassword", label: "New password", type: "password", required: true, autocomplete: "new-password",
        help: "At least 8 characters, with an uppercase letter, a lowercase letter and a digit." },
      { name: "confirm", label: "Confirm new password", type: "password", required: true, autocomplete: "new-password" },
    ];
    const form = window.UI.buildForm(fields, {});
    const submit = el("button", { class: "btn primary", type: "submit", text: "Change password" });
    form.appendChild(el("div", { class: "form-actions" }, [submit]));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      window.UI.clearFieldErrors(form);

      const values = window.UI.readForm(form, fields);
      if (values.newPassword !== values.confirm) {
        window.UI.showFieldErrors(form, [{ field: "confirm", message: "The two passwords do not match" }]);
        return;
      }

      window.UI.busy(submit, true);
      try {
        const { data } = await window.Api.post("/auth/change-password", {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        });
        form.reset();
        toast(
          data.otherSessionsEnded
            ? `Password changed. ${data.otherSessionsEnded} other session(s) were signed out.`
            : "Password changed.",
          "success"
        );
        // Refresh the cached user so the mustChangePassword prompt disappears.
        await window.Auth.reloadUser();
      } catch (err) {
        if (err.isValidation) window.UI.showFieldErrors(form, err.errors);
        else toast(err.message, "error");
      } finally {
        window.UI.busy(submit, false);
      }
    });

    return el("section", { class: "card", id: "password-card" }, [
      el("div", { class: "card-head" }, [
        el("h3", { class: "card-title", text: "Change password" }),
        el("span", { class: "small muted", text: "Other devices are signed out." }),
      ]),
      el("div", { class: "card-body" }, [
        user.mustChangePassword
          ? el("div", {
              class: "alert alert-warning",
              text: "Your password was set by an administrator. Please choose your own.",
            })
          : null,
        form,
      ].filter(Boolean)),
    ]);
  }

  /**
   * The permissions this account actually holds, grouped by module.
   * Read from the server's response, not from the local mirror.
   */
  function permissionsCard(user) {
    const grouped = new Map();
    (user.permissions || []).forEach((name) => {
      // Group by the leading noun, which is how the catalogue is organised.
      const module = name.replace(/^(View|Manage|Assign|Search|Submit|Approve|Publish|Update)\s+/, "");
      const key = module.split(" ").pop();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(name);
    });

    return el("section", { class: "card" }, [
      el("div", { class: "card-head" }, [
        el("h3", { class: "card-title", text: `Permissions (${(user.permissions || []).length})` }),
        badge(user.role?.name || "", "primary"),
      ]),
      el("div", { class: "card-body" }, [
        el("p", { class: "small muted", text:
          "These come from your role. The interface hides what you cannot do, and the server independently rejects it — " +
          "changing this list in the browser grants nothing." }),
        el(
          "div",
          { class: "row", style: { marginTop: "0.75rem", alignItems: "flex-start" } },
          [...grouped.entries()].map(([group, list]) =>
            el("div", { style: { minWidth: "180px" } }, [
              el("strong", { class: "small", text: group }),
              el("ul", { class: "small muted" }, list.map((p) => el("li", { text: p }))),
            ])
          )
        ),
      ]),
    ]);
  }

  (async function load() {
    try {
      const { data } = await window.Api.get("/auth/me");
      const user = data.user;
      window.Auth.saveSession({ user });

      window.UI.render(
        content,
        el("div", { class: "dashboard-columns" }, [
          detailCard(user),
          editCard(user),
          passwordCard(user),
          permissionsCard(user),
        ])
      );

      // Arrived here straight after signing in with an admin-set password.
      if (params.has("changePassword") || user.mustChangePassword) {
        document.getElementById("password-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (err) {
      window.UI.render(content, window.UI.errorState(err.message, load));
    }
  })();
})();
