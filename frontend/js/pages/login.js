/**
 * Login page.
 */
(function () {
  "use strict";

  const { el, toast } = window.UI;
  const form = document.getElementById("login-form");
  const submit = document.getElementById("submit");
  const alertHost = document.getElementById("alert-host");
  const params = new URLSearchParams(window.location.search);

  /** Where to go after signing in — honours ?next= from the auth guard. */
  function destination() {
    const next = params.get("next");
    // Only accept a same-site path: an absolute URL here would be an open
    // redirect, letting a crafted link bounce a freshly-authenticated user to
    // an attacker's page.
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return "/pages/dashboard.html";
  }

  // Already signed in? Skip the form.
  if (window.Auth.isLoggedIn() && !params.has("expired")) {
    window.location.replace(destination());
    return;
  }

  if (params.has("expired")) {
    alertHost.appendChild(
      el("div", { class: "alert alert-info", text: "Your session ended. Please sign in again." })
    );
    // Clear stale credentials so api.js does not try to refresh with a dead token.
    window.Auth.clear();
  }

  if (params.has("registered")) {
    alertHost.appendChild(
      el("div", { class: "alert alert-success", text: "Account created. You can sign in now." })
    );
  }

  if (params.has("reset")) {
    alertHost.appendChild(
      el("div", { class: "alert alert-success", text: "Password updated. Sign in with your new password." })
    );
  }

  // Clicking a demo row fills the form rather than making the reader retype it.
  document.getElementById("demo-rows")?.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-email]");
    if (!row) return;
    form.email.value = row.dataset.email;
    form.password.value = row.dataset.password;
    form.email.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    window.UI.clearFieldErrors(form);
    alertHost.textContent = "";

    const email = form.email.value.trim();
    const password = form.password.value;

    // A client-side check for empty fields only. Everything else is the
    // server's decision — duplicating the password policy here would just drift.
    if (!email || !password) {
      window.UI.showFieldErrors(form, [
        !email && { field: "email", message: "Email is required" },
        !password && { field: "password", message: "Password is required" },
      ].filter(Boolean));
      return;
    }

    window.UI.busy(submit, true, "Signing in…");

    try {
      const { data } = await window.Api.postPublic("/auth/login", { email, password });

      window.Auth.saveSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });

      // An account created by an administrator carries a password the admin
      // chose, so send the holder straight to changing it.
      if (data.user.mustChangePassword) {
        window.location.replace("/pages/profile.html?changePassword=1");
        return;
      }

      window.location.replace(destination());
    } catch (err) {
      if (err.isValidation) {
        window.UI.showFieldErrors(form, err.errors);
      } else {
        // The server deliberately returns one generic message for both a wrong
        // password and an unknown address, so it is shown as-is.
        alertHost.appendChild(el("div", { class: "alert alert-error", text: err.message }));
        form.password.value = "";
        form.password.focus();
      }
    } finally {
      window.UI.busy(submit, false);
    }
  });
})();
