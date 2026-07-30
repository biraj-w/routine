/**
 * Roles and permissions.
 *
 * This page is where the RBAC model becomes concrete: the four roles, their data
 * scopes, and exactly which permissions each holds.
 *
 * Editing a role's grants invalidates the server's permission cache, so the change
 * applies on the affected users' NEXT request rather than when their tokens expire.
 * That is the payoff for resolving permissions from the database instead of
 * trusting token claims, and it is worth demonstrating live: remove "Manage
 * Routine" from Department Admin, and their Add-class button is gone on reload.
 */
(function () {
  "use strict";

  if (!window.Auth.requirePermission(window.PERM.VIEW_ROLES)) return;

  const { el, toast, badge } = window.UI;

  const canAssign = window.Auth.hasPermission(window.PERM.ASSIGN_PERMISSIONS);

  const content = window.Layout.mount({
    title: "Roles and permissions",
    subtitle:
      "A role answers what a user may do; its data scope answers which records they may do it to. Both are enforced on the server for every request.",
  });

  window.UI.render(content, window.UI.spinner("Loading roles…"));

  const SCOPE_HELP = {
    global: "Every record, in every department.",
    department: "Only records belonging to the user's own department.",
    self: "Only records belonging to the user personally.",
  };

  function roleCard(role, catalogue) {
    const held = new Set(role.permissions);

    return el("section", { class: "card" }, [
      el("div", { class: "card-head" }, [
        el("div", {}, [
          el("h3", { class: "card-title", text: role.name }),
          el("p", { class: "small muted", text: role.description || "" }),
        ]),
        el("div", { class: "row" }, [
          badge(role.dataScope, role.dataScope === "global" ? "danger" : role.dataScope === "department" ? "warning" : "info"),
          role.isSystem ? badge("System", "neutral") : null,
          canAssign
            ? el("button", {
                class: "btn ghost small",
                type: "button",
                text: "Edit permissions",
                onClick: () => openEditor(role, catalogue),
              })
            : null,
        ].filter(Boolean)),
      ]),
      el("div", { class: "card-body" }, [
        el("p", { class: "small muted", text: `Scope — ${SCOPE_HELP[role.dataScope] || ""}` }),
        el("p", { class: "small", text: `${role.permissionCount} permission(s)` }),
        el(
          "div",
          { class: "row", style: { alignItems: "flex-start", marginTop: "0.5rem" } },
          Object.entries(catalogue).map(([module, list]) => {
            const owned = list.filter((p) => held.has(p.name));
            if (!owned.length) return null;
            return el("div", { style: { minWidth: "170px" } }, [
              el("strong", { class: "small", text: module }),
              el("ul", { class: "small muted" }, owned.map((p) => el("li", { text: p.name }))),
            ]);
          }).filter(Boolean)
        ),
      ]),
    ]);
  }

  /** Checkbox editor over the full catalogue, grouped by module. */
  function openEditor(role, catalogue) {
    const held = new Set(role.permissions);
    const body = el("div");

    body.appendChild(
      el("div", {
        class: "alert alert-warning",
        text:
          "Changes take effect on each affected user's next request — they do not have to sign in again. " +
          "Removing a permission a role depends on will make parts of the interface disappear for those users.",
      })
    );

    Object.entries(catalogue).forEach(([module, list]) => {
      const group = el("div", { style: { marginBottom: "0.85rem" } }, [
        el("strong", { class: "small", text: module }),
      ]);
      list.forEach((permission) => {
        const id = `perm-${permission.name.replace(/\s+/g, "-")}`;
        group.appendChild(
          el("label", { class: "checkbox-label", for: id, style: { paddingTop: "0.2rem" } }, [
            el("input", {
              id,
              type: "checkbox",
              value: permission.name,
              checked: held.has(permission.name),
              dataset: { permission: "true" },
            }),
            ` ${permission.name}`,
            el("small", { class: "muted", text: permission.description ? ` — ${permission.description}` : "" }),
          ])
        );
      });
      body.appendChild(group);
    });

    const save = el("button", { class: "btn primary", type: "button", text: "Save permissions" });

    const handle = window.UI.modal({
      title: `Permissions — ${role.name}`,
      body,
      wide: true,
      footer: el("div", { class: "modal-actions" }, [
        el("button", { class: "btn ghost", type: "button", text: "Cancel", onClick: () => handle.close() }),
        save,
      ]),
    });

    save.addEventListener("click", async () => {
      const selected = [...body.querySelectorAll('input[data-permission="true"]:checked')].map((n) => n.value);
      window.UI.busy(save, true);

      try {
        await window.Api.put(`/roles/${role.id}/permissions`, { permissions: selected });
        handle.close();
        toast(`${role.name} now holds ${selected.length} permission(s)`, "success");

        // If the caller edited their OWN role, their cached permission list is
        // now stale and the sidebar would be wrong until the next sign-in.
        if (window.Auth.roleName() === role.name) {
          await window.Auth.reloadUser();
          window.location.reload();
          return;
        }
        load();
      } catch (err) {
        toast(err.message, "error");
      } finally {
        window.UI.busy(save, false);
      }
    });
  }

  async function load() {
    window.UI.render(content, window.UI.spinner("Loading roles…"));

    try {
      const [{ data: roles }, { data: catalogue }] = await Promise.all([
        window.Api.get("/roles"),
        window.Api.get("/roles/permissions"),
      ]);

      window.UI.render(
        content,
        el("div", { class: "section-stack" }, roles.map((role) => roleCard(role, catalogue)))
      );
    } catch (err) {
      window.UI.render(content, window.UI.errorState(err.message, load));
    }
  }

  load();
})();
