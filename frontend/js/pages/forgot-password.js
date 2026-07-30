/**
 * Forgot password.
 *
 * The server always reports success, whether or not the address exists, so this
 * page must not imply otherwise — showing "no such account" would turn the
 * endpoint into an account enumerator.
 *
 * There is no mail service in this project. Delivery is simulated: the reset link
 * is written to the server console, and in development the token is also returned
 * so the flow can be completed without one. That is shown here explicitly rather
 * than pretending an email was sent.
 */
(function () {
  "use strict";

  const { el } = window.UI;
  const app = document.getElementById("app");

  const form = el("form", { class: "auth-form", novalidate: true });
  const emailGroup = el("div", { class: "form-group" }, [
    el("label", { for: "email", text: "Email address" }),
    el("input", { id: "email", name: "email", type: "email", required: true, autocomplete: "username" }),
    el("small", { class: "field-error", dataset: { errorFor: "email" } }),
  ]);
  const submit = el("button", { class: "btn primary block", type: "submit", text: "Send reset link" });
  form.append(emailGroup, submit);

  const alertHost = el("div", { id: "alert-host" });

  window.UI.render(
    app,
    el("div", { class: "auth-brand" }, [
      el("span", { class: "auth-brand-mark", "aria-hidden": "true", text: "◴" }),
      el("div", {}, [
        el("h1", { class: "auth-title", text: "Reset your password" }),
        el("p", { class: "auth-subtitle", text: "We'll send a single-use link that expires in 15 minutes." }),
      ]),
    ]),
    alertHost,
    form,
    el("div", { class: "auth-footer" }, [el("a", { href: "login.html", text: "Back to sign in" })])
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    window.UI.clearFieldErrors(form);
    alertHost.textContent = "";
    window.UI.busy(submit, true, "Sending…");

    try {
      const { data, message } = await window.Api.postPublic("/auth/forgot-password", {
        email: form.email.value.trim(),
      });

      alertHost.appendChild(el("div", { class: "alert alert-success", text: message }));

      // Development convenience: the API returns the raw token outside
      // production so the flow is demonstrable with no mail server.
      if (data?.devToken) {
        alertHost.appendChild(
          el("div", { class: "alert alert-info" }, [
            el("strong", { text: "Development mode" }),
            el("p", { class: "small", text: "No email is sent. Use this link, which is also printed in the server console:" }),
            el("a", { href: `reset-password.html?token=${data.devToken}`, text: "Continue to set a new password →" }),
          ])
        );
      }

      form.hidden = true;
    } catch (err) {
      if (err.isValidation) window.UI.showFieldErrors(form, err.errors);
      else alertHost.appendChild(el("div", { class: "alert alert-error", text: err.message }));
    } finally {
      window.UI.busy(submit, false);
    }
  });
})();
