/**
 * Reports.
 *
 * Six report types behind one picker. Teacher and student reports are pinned
 * server-side to the caller's own profile when they lack "View Routine", so a
 * teacher opening this page sees their own workload and cannot request a
 * colleague's.
 */
(function () {
  "use strict";

  if (!window.Auth.requirePermission([window.PERM.VIEW_REPORTS, window.PERM.VIEW_OWN_ROUTINE])) return;

  const { el, badge } = window.UI;
  const { idOf, labelOf } = window.Fmt;

  const canSeeAll = window.Auth.hasPermission(window.PERM.VIEW_ROUTINE);

  /** Report definitions: which selector each needs, and how to render it. */
  const REPORTS = [
    { key: "weekly", label: "Weekly routine", selector: null, render: renderGridReport },
    { key: "daily", label: "Daily routine", selector: "day", render: renderDaily },
    { key: "teacher", label: "Teacher routine", selector: canSeeAll ? "teacher" : null, render: renderGridReport },
    { key: "student", label: "Student routine", selector: canSeeAll ? "student" : null, render: renderGridReport },
    { key: "department", label: "Department routine", selector: "department", render: renderDepartment, requires: window.PERM.VIEW_REPORTS },
    { key: "room-utilisation", label: "Room utilisation", selector: null, render: renderRooms, requires: window.PERM.VIEW_REPORTS },
  ].filter((r) => !r.requires || window.Auth.hasPermission(r.requires));

  const state = { report: REPORTS[0].key, selection: "", day: "" };

  const content = window.Layout.mount({
    title: "Reports",
    subtitle: "Printable views of the published timetable.",
    actions: [el("button", { class: "btn ghost", type: "button", text: "Print", onClick: () => window.print() })],
  });

  const tabs = el("div", { class: "tabs" });
  const controls = el("div", { class: "toolbar" });
  const host = el("div");
  window.UI.render(content, tabs, controls, host);

  REPORTS.forEach((report) => {
    tabs.appendChild(
      el("button", {
        class: `tab${report.key === state.report ? " is-active" : ""}`,
        type: "button",
        text: report.label,
        onClick: () => {
          state.report = report.key;
          state.selection = "";
          [...tabs.children].forEach((t) => t.classList.remove("is-active"));
          tabs.querySelector(`.tab:nth-child(${REPORTS.indexOf(report) + 1})`)?.classList.add("is-active");
          buildControls();
          run();
        },
      })
    );
  });

  /** A selector appropriate to the chosen report, if it needs one. */
  async function buildControls() {
    const report = REPORTS.find((r) => r.key === state.report);
    controls.textContent = "";
    if (!report.selector) return;

    if (report.selector === "day") {
      const select = el("select", { class: "filter-select", "aria-label": "Day" });
      select.appendChild(el("option", { value: "", text: "Today" }));
      window.DAYS.forEach((d) => select.appendChild(el("option", { value: d, text: d, selected: state.day === d })));
      select.addEventListener("change", (event) => {
        state.day = event.target.value;
        run();
      });
      controls.appendChild(el("div", { class: "toolbar-left" }, [select]));
      return;
    }

    const resourceMap = {
      teacher: { resource: "teachers", labelKey: "fullName" },
      student: { resource: "students", labelKey: "fullName" },
      department: { resource: "departments", labelKey: "name" },
    };
    const cfg = resourceMap[report.selector];
    const select = el("select", { class: "filter-select", "aria-label": report.label });
    select.appendChild(el("option", { value: "", text: `Choose a ${report.selector}…` }));
    controls.appendChild(el("div", { class: "toolbar-left" }, [select]));

    try {
      const { rows } = await window.Api.list(cfg.resource, { limit: 200 });
      rows.forEach((row) =>
        select.appendChild(el("option", { value: idOf(row), text: labelOf(row, cfg.labelKey) }))
      );
    } catch (err) {
      select.disabled = true;
    }

    select.addEventListener("change", (event) => {
      state.selection = event.target.value;
      run();
    });
  }

  /* ── Renderers ───────────────────────────────────────────────────────────── */

  function summaryTiles(summary) {
    const labels = {
      totalClasses: "Classes",
      totalHours: "Hours",
      weeklyLimit: "Weekly limit",
      distinctCourses: "Courses",
      daysTeaching: "Teaching days",
      daysWithClasses: "Days with classes",
      totalCredits: "Credits",
      distinctTeachers: "Teachers",
      distinctRooms: "Rooms",
      cohorts: "Cohorts",
      averagePerDay: "Average per day",
      teachersEngaged: "Teachers engaged",
      roomsInUse: "Rooms in use",
      totalRooms: "Rooms",
      unused: "Never booked",
      averageUtilisation: "Average utilisation",
      busiestPeriod: "Busiest period",
    };

    const tiles = Object.entries(summary || {})
      .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
      .map(([key, value]) =>
        el("div", { class: "stat-tile" }, [
          el("span", { class: "stat-label", text: labels[key] || key }),
          el("span", { class: "stat-value", text: String(value) }),
        ])
      );

    return tiles.length ? el("div", { class: "stat-grid" }, tiles) : null;
  }

  /** Weekly, teacher and student reports all render as a grid. */
  function renderGridReport(data) {
    const gridHost = el("div");
    const nodes = [];

    if (data.subject) {
      const s = data.subject;
      nodes.push(
        el("p", { class: "muted small", text: s.employeeCode ? `${s.fullName} (${s.employeeCode})` : `${s.fullName} — ${s.rollNo}` })
      );
    }
    if (data.summary?.isOverloaded) {
      nodes.push(
        el("div", {
          class: "alert alert-warning",
          text: `This teacher is scheduled for ${data.summary.totalClasses} classes, above their limit of ${data.summary.weeklyLimit}.`,
        })
      );
    }

    nodes.push(summaryTiles(data.summary), gridHost, window.RoutineGrid.legend());
    window.UI.render(host, ...nodes.filter(Boolean));

    if (!data.entries?.length) {
      window.UI.render(gridHost, window.UI.emptyState("No published classes for this selection."));
      return;
    }
    window.RoutineGrid.render(gridHost, {
      entries: data.entries,
      timeSlots: data.timeSlots,
      days: data.days,
      editable: false,
    });
  }

  function renderDaily(data) {
    const rows = (data.byPeriod || []).filter((p) => p.entries.length);

    if (!rows.length) {
      window.UI.render(host, summaryTiles(data.summary), window.UI.emptyState(`No classes on ${data.day}.`));
      return;
    }

    const table = el("table", { class: "data-table" });
    table.appendChild(
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "Period" }),
          el("th", { text: "Course" }),
          el("th", { text: "Teacher" }),
          el("th", { text: "Room" }),
          el("th", { text: "Cohort" }),
        ]),
      ])
    );

    const tbody = el("tbody");
    rows.forEach((period) => {
      period.entries.forEach((entry, i) => {
        tbody.appendChild(
          el("tr", {}, [
            // The period label is only printed on its first row, so the grouping
            // is visible without a nested table.
            el("td", { class: "mono", text: i === 0 ? period.timeSlot.label : "" }),
            el("td", { text: `${labelOf(entry.course, "code")} — ${labelOf(entry.course, "title")}` }),
            el("td", { text: labelOf(entry.teacher, "fullName") }),
            el("td", { text: labelOf(entry.room, "code") }),
            el("td", { text: `${labelOf(entry.department, "code")} · L${entry.semester?.number ?? "?"} · ${entry.section}` }),
          ])
        );
      });
    });
    table.appendChild(tbody);

    window.UI.render(
      host,
      el("h3", { class: "card-title", text: data.day }),
      summaryTiles(data.summary),
      el("div", { class: "table-host" }, [el("div", { class: "table-scroll" }, [table])])
    );
  }

  function renderDepartment(data) {
    if (!data.groups?.length) {
      window.UI.render(host, window.UI.emptyState("No published classes for this department."));
      return;
    }

    const nodes = [summaryTiles(data.summary)];

    // One grid per cohort: a department's timetable is read cohort by cohort,
    // not as one combined sheet.
    data.groups.forEach((group) => {
      const gridHost = el("div");
      nodes.push(
        el("section", { class: "section-stack" }, [
          el("h3", {
            class: "card-title",
            text: `Semester ${group.semester?.number ?? "?"} — Section ${group.section}`,
          }),
          gridHost,
        ])
      );
      // Rendered after insertion, so the host is in the document.
      setTimeout(
        () =>
          window.RoutineGrid.render(gridHost, {
            entries: group.entries,
            timeSlots: data.timeSlots,
            days: data.days,
            editable: false,
          }),
        0
      );
    });

    nodes.push(window.RoutineGrid.legend());
    window.UI.render(host, ...nodes.filter(Boolean));
  }

  function renderRooms(data) {
    const table = el("table", { class: "data-table" });
    table.appendChild(
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "Room" }),
          el("th", { text: "Building" }),
          el("th", { text: "Type" }),
          el("th", { class: "align-right", text: "Seats" }),
          el("th", { class: "align-right", text: "Booked" }),
          el("th", { class: "align-right", text: "Free" }),
          el("th", { class: "align-right", text: "Utilisation" }),
        ]),
      ])
    );
    table.appendChild(
      el(
        "tbody",
        {},
        (data.rooms || []).map((r) =>
          el("tr", {}, [
            el("td", { text: r.code }),
            el("td", { text: r.building }),
            el("td", {}, [badge(r.type, r.type === "Lab" ? "success" : "primary")]),
            el("td", { class: "align-right", text: String(r.seats) }),
            el("td", { class: "align-right", text: String(r.booked) }),
            el("td", { class: "align-right", text: String(r.free) }),
            el("td", { class: "align-right" }, [
              badge(
                `${r.utilisationPercent}%`,
                r.booked === 0 ? "neutral" : r.utilisationPercent >= 75 ? "warning" : "success"
              ),
            ]),
          ])
        )
      )
    );

    window.UI.render(
      host,
      summaryTiles(data.summary),
      el("p", { class: "small muted", text: `Out of ${data.bookableSlotsPerWeek} bookable slots per week.` }),
      el("div", { class: "table-host" }, [el("div", { class: "table-scroll" }, [table])])
    );
  }

  /* ── Run ─────────────────────────────────────────────────────────────────── */

  async function run() {
    const report = REPORTS.find((r) => r.key === state.report);

    // Reports needing a subject wait for one, rather than firing a 400.
    if (report.selector && report.selector !== "day" && !state.selection) {
      window.UI.render(host, window.UI.emptyState(`Choose a ${report.selector} to generate this report.`));
      return;
    }

    window.UI.render(host, window.UI.spinner("Generating report…"));

    const query = {};
    if (report.selector === "day") query.day = state.day || undefined;
    else if (report.selector) query[report.selector] = state.selection;

    try {
      const { data } = await window.Api.get(`/reports/${report.key}`, query);
      report.render(data);
    } catch (err) {
      window.UI.render(host, window.UI.errorState(err.message, run));
    }
  }

  buildControls().then(run);
})();
