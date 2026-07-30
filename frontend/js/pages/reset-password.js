/**
 * Set a new password from a reset token.
 *
 * The token arrives in the query string. It is single-use and expiring, and the
 * server stores only its SHA-256 hash — so a used or stale link fails with a 400
 * rather than being quietly accepted.
 */
(function () {
  "use strict";

  const { el } = window.UI;
  const app = document.getElementById("app");
  const token = new URLSearchParams(window.location.search).get("token");

  const alertHost = el("div", { id: "alert-host" });

  const header = el("div", { class: "auth-brand" }, [
    el("span", { class: "auth-brand-mark", "aria-hidden": "true", text: "◴" }),
    el("div", {}, [
      el("h1", { class: "auth-title", text: "Set a new password" }),
      el("p", { class: "auth-subtitle", text: "This link can only be used once." }),
    ]),
  ]);

  if (!token) {
    window.UI.render(
      app,
      header,
      el("div", { class: "alert alert-error", text: "This link is missing its token. Request a new reset email." }),
      el("div", { class: "auth-footer" }, [el("a", { href: "forgot-password.html", text: "Request a new link" })])
    );
    return;
  }

  const fields = [
    {
      name: "newPassword",
      label: "New password",
      type: "password",
      required: true,
      autocomplete: "new-password",
      help: "At least 8 characters, with an uppercase letter, a lowercase letter and a digit.",
    },
    { name: "confirm", label: "Confirm new password", type: "password", required: true, autocomplete: "new-password" },
  ];

  const form = window.UI.buildForm(fields, {});
  form.classList.add("single");
  const submit = el("button", { class: "btn primary block", type: "submit", text: "Update password" });
  form.appendChild(el("div", { class: "form-actions" }, [submit]));

  window.UI.render(
    app,
    header,
    alertHost,
    form,
    el("div", { class: "auth-footer" }, [el("a", { href: "login.html", text: "Back to sign in" })])
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    window.UI.clearFieldErrors(form);
    alertHost.textContent = "";

    const { newPassword, confirm } = window.UI.readForm(form, fields);

    // Confirmation is purely a client-side courtesy — the server has no second
    // field to compare, so checking it here is the only place it can happen.
    if (newPassword !== confirm) {
      window.UI.showFieldErrors(form, [{ field: "confirm", message: "The two passwords do not match" }]);
      return;
    }

    window.UI.busy(submit, true, "Updating…");

    try {
      await window.Api.postPublic("/auth/reset-password", { token, newPassword });
      // Every session was revoked server-side, so any local credentials are dead.
      window.Auth.clear();
      window.location.replace("login.html?reset=1");
    } catch (err) {
      if (err.isValidation) window.UI.showFieldErrors(form, err.errors);
      else alertHost.appendChild(el("div", { class: "alert alert-error", text: err.message }));
    } finally {
      window.UI.busy(submit, false);
    }
  });
})();
