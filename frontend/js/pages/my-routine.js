/**
 * "My routine" — a teacher's or student's own timetable.
 *
 * The server resolves WHOSE routine this is from the caller's linked profile, so
 * there is no id in the URL and no way to ask for somebody else's. Published
 * entries only.
 */
(function () {
  "use strict";

  if (!window.Auth.requirePermission([window.PERM.VIEW_OWN_ROUTINE, window.PERM.VIEW_ROUTINE])) return;

  const { el } = window.UI;

  const content = window.Layout.mount({
    title: "My routine",
    subtitle: "Your published timetable for the current term.",
    actions: [el("button", { class: "btn ghost", type: "button", text: "Print", onClick: () => window.print() })],
  });

  window.UI.render(content, window.UI.spinner("Loading your timetable…"));

  (async function load() {
    try {
      const { data } = await window.Api.get("/routines/me");

      const label =
        data.as === "teacher"
          ? `${data.profile.fullName} (${data.profile.employeeCode})`
          : `${data.profile.fullName} — ${data.profile.rollNo}, section ${data.profile.section}` +
            (data.profile.groupLabel && data.profile.groupLabel !== "ALL" ? ` (${data.profile.groupLabel})` : "");

      if (!data.entries.length) {
        window.UI.render(
          content,
          el("p", { class: "muted small", text: label }),
          window.UI.emptyState(
            "You have no published classes yet. A routine only appears here once it has been published."
          )
        );
        return;
      }

      const gridHost = el("div");
      const totalHours = data.entries.length;

      window.UI.render(
        content,
        el("div", { class: "toolbar" }, [
          el("div", { class: "toolbar-left" }, [el("span", { class: "small muted", text: label })]),
          el("div", { class: "toolbar-right" }, [
            el("span", { class: "result-count", text: `${totalHours} class(es) per week` }),
          ]),
        ]),
        gridHost,
        window.RoutineGrid.legend()
      );

      // Read-only: a teacher cannot edit the routine, which is enforced by
      // permissions server-side and reflected here by editable: false.
      window.RoutineGrid.render(gridHost, {
        entries: data.entries,
        timeSlots: data.timeSlots,
        days: data.days,
        editable: false,
      });
    } catch (err) {
      window.UI.render(content, window.UI.errorState(err.message, load));
    }
  })();
})();
