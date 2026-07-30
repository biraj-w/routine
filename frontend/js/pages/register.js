/**
 * Public registration.
 *
 * Creates a STUDENT account and nothing else. There is deliberately no role
 * selector: the server assigns the role and ignores any `role` in the body, so
 * offering the choice here would be a lie about what the endpoint does.
 *
 * Enrolment details (department, semester, roll number) are optional but must be
 * supplied together — all three or none — because a student profile needs all of
 * them to resolve a timetable.
 */
(function () {
  "use strict";

  const { el, toast } = window.UI;

  const app = document.getElementById("app");

  const fields = [
    { name: "name", label: "Full name", type: "text", required: true },
    { name: "email", label: "Email address", type: "email", required: true, autocomplete: "username" },
    {
      name: "password",
      label: "Password",
      type: "password",
      required: true,
      autocomplete: "new-password",
      help: "At least 8 characters, with an uppercase letter, a lowercase letter and a digit.",
    },
    { name: "phone", label: "Phone (optional)", type: "tel" },
    { name: "rollNo", label: "Roll number (optional)", type: "text", placeholder: "CSE-2301" },
    { name: "department", label: "Department (optional)", type: "ref", resource: "departments", labelKey: "name" },
    { name: "semester", label: "Semester (optional)", type: "ref", resource: "semesters", labelKey: "label" },
    { name: "section", label: "Section (optional)", type: "text", default: "A" },
  ];

  async function build() {
    // Reference dropdowns are public data here — the endpoints require auth, so
    // fetch them without a token and degrade to a free-text-free form if they
    // are unavailable to an anonymous caller.
    const withOptions = await Promise.all(
      fields.map(async (field) => {
        if (field.type !== "ref") return field;
        try {
          const { data } = await window.Api.request("GET", `/${field.resource}`, {
            query: { limit: 200 },
            auth: false,
          });
          return { ...field, options: data || [] };
        } catch {
          // Not readable anonymously: keep the field but leave it empty so the
          // user can still register without enrolment details.
          return { ...field, options: [], help: "Sign in later to have this set by your department." };
        }
      })
    );

    const form = window.UI.buildForm(withOptions, {});
    form.classList.add("single");

    const submit = el("button", { class: "btn primary block", type: "submit", text: "Create account" });
    form.appendChild(el("div", { class: "form-actions" }, [submit]));

    const alertHost = el("div", { id: "alert-host" });

    window.UI.render(
      app,
      el("div", { class: "auth-brand" }, [
        el("span", { class: "auth-brand-mark", "aria-hidden": "true", text: "◴" }),
        el("div", {}, [
          el("h1", { class: "auth-title", text: "Create a student account" }),
          el("p", { class: "auth-subtitle", text: "Staff accounts are created by an administrator." }),
        ]),
      ]),
      alertHost,
      form,
      el("div", { class: "auth-footer" }, [
        "Already have an account? ",
        el("a", { href: "login.html", text: "Sign in" }),
      ])
    );

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      window.UI.clearFieldErrors(form);
      alertHost.textContent = "";

      const values = window.UI.readForm(form, withOptions);

      // Mirror the server's all-or-nothing rule, so the user is told before a
      // round trip rather than after.
      const enrolment = ["department", "semester", "rollNo"];
      const supplied = enrolment.filter((k) => values[k]);
      if (supplied.length && supplied.length < 3) {
        window.UI.showFieldErrors(
          form,
          enrolment
            .filter((k) => !values[k])
            .map((k) => ({ field: k, message: "Provide department, semester and roll number together, or leave all three blank." }))
        );
        return;
      }

      // Strip empties so the server's `optional()` rules apply.
      const body = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "" && v !== null));
      window.UI.busy(submit, true, "Creating…");

      try {
        await window.Api.postPublic("/auth/register", body);
        window.location.replace("login.html?registered=1");
      } catch (err) {
        if (err.isValidation) window.UI.showFieldErrors(form, err.errors);
        else alertHost.appendChild(el("div", { class: "alert alert-error", text: err.message }));
      } finally {
        window.UI.busy(submit, false);
      }
    });
  }

  build();
})();
