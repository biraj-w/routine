/**
 * Dashboard.
 *
 * One request to /api/dashboard returns everything on this page. The figures are
 * already department-scoped by the server, so nothing here branches on role — a
 * Department Admin simply sees smaller numbers.
 */
(function () {
  "use strict";

  if (!window.Auth.requirePermission(window.PERM.VIEW_DASHBOARD)) return;

  const { el, badge } = window.UI;
  const user = window.Auth.getUser();

  const content = window.Layout.mount({
    title: "Dashboard",
    subtitle: user?.department
      ? `${user.department.name} — figures below cover your department only.`
      : "Institution-wide overview.",
  });

  window.UI.render(content, window.UI.spinner("Loading dashboard…"));

  /* ── Pieces ──────────────────────────────────────────────────────────────── */

  const statTile = (label, value, hint) =>
    el("div", { class: "stat-tile" }, [
      el("span", { class: "stat-label", text: label }),
      el("span", { class: "stat-value", text: String(value ?? 0) }),
      hint && el("span", { class: "stat-hint", text: hint }),
    ]);

  function card(title, bodyNode, action = null) {
    return el("section", { class: "card" }, [
      el("div", { class: "card-head" }, [el("h3", { class: "card-title", text: title }), action]),
      bodyNode,
    ]);
  }

  function todayCard(today) {
    if (!today.isTeachingDay) {
      return card("Today", window.UI.emptyState("Today is not a teaching day."));
    }
    if (!today.classes.length) {
      return card(`Today — ${today.day}`, window.UI.emptyState("No classes scheduled for today."));
    }

    const upcomingIds = new Set(today.upcoming.map((c) => String(c._id)));

    return card(
      `Today — ${today.day}`,
      el(
        "ul",
        { class: "schedule-list" },
        today.classes.map((c) =>
          el("li", { class: `schedule-item${upcomingIds.has(String(c._id)) ? " is-upcoming" : ""}` }, [
            el("span", { class: "schedule-time", text: `${c.slot.startTime}–${c.slot.endTime}` }),
            el("div", { class: "schedule-main" }, [
              el("span", { class: "schedule-course", text: `${c.course.code} · ${c.course.title}` }),
              el("span", {
                class: "schedule-meta",
                text: `${c.teacher.fullName} · Room ${c.room.code} · Section ${c.section}${
                  c.groupLabel && c.groupLabel !== "ALL" ? ` (${c.groupLabel})` : ""
                }`,
              }),
            ]),
            upcomingIds.has(String(c._id)) ? badge("Upcoming", "primary") : null,
          ])
        )
      ),
      el("span", { class: "small muted", text: `${today.upcoming.length} still to come` })
    );
  }

  function workloadCard(rows) {
    if (!rows.length) return card("Teacher workload", window.UI.emptyState("No classes scheduled yet."));

    return card(
      "Teacher workload",
      el(
        "ul",
        { class: "bar-list" },
        rows.map((t) => {
          const pct = Math.min(100, t.utilisationPercent || 0);
          const tone = t.isOverloaded ? " is-over" : pct >= 85 ? " is-high" : "";
          return el("li", { class: "bar-row" }, [
            el("div", { class: "bar-head" }, [
              el("span", { class: "bar-name", text: t.fullName }),
              el("span", {
                class: "bar-value",
                text: `${t.classes}/${t.maxWeeklyClasses} classes · ${t.utilisationPercent}%`,
              }),
            ]),
            el("div", { class: "bar-track" }, [
              el("div", { class: `bar-fill${tone}`, style: { width: `${pct}%` } }),
            ]),
          ]);
        })
      )
    );
  }

  function roomCard(data) {
    const rooms = (data.rooms || []).slice().sort((a, b) => b.utilisationPercent - a.utilisationPercent);
    if (!rooms.length) return card("Room utilisation", window.UI.emptyState("No rooms configured."));

    return card(
      "Room utilisation",
      el(
        "ul",
        { class: "bar-list" },
        rooms.slice(0, 8).map((r) =>
          el("li", { class: "bar-row" }, [
            el("div", { class: "bar-head" }, [
              el("span", { class: "bar-name", text: `${r.code} · ${r.type}` }),
              el("span", { class: "bar-value", text: `${r.booked}/${data.bookableSlotsPerWeek} · ${r.utilisationPercent}%` }),
            ]),
            el("div", { class: "bar-track" }, [
              el("div", {
                class: `bar-fill${r.utilisationPercent >= 85 ? " is-high" : ""}`,
                style: { width: `${Math.min(100, r.utilisationPercent)}%` },
              }),
            ]),
          ])
        )
      ),
      el("span", { class: "small muted", text: `${rooms.filter((r) => r.booked === 0).length} unused` })
    );
  }

  /** Heat map of how busy each (day, period) cell is. */
  function densityCard(density, timeSlotOrder) {
    if (!density.cells?.length) return null;

    // Five discrete bands read better at this size than a continuous scale.
    const band = (count) => {
      if (!count) return 0;
      const ratio = count / (density.maxCount || 1);
      return ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
    };

    const slots = [...new Map(density.cells.map((c) => [String(c.timeSlot), c])).values()].sort(
      (a, b) => a.order - b.order
    );
    const lookup = new Map(density.cells.map((c) => [`${c.day}|${c.timeSlot}`, c.count]));

    const table = el("table");
    table.appendChild(
      el("thead", {}, [
        el("tr", {}, [
          el("th", { class: "heat-day", text: "Day" }),
          ...slots.map((s) => el("th", { text: s.label })),
        ]),
      ])
    );
    table.appendChild(
      el(
        "tbody",
        {},
        density.days.map((day) =>
          el("tr", {}, [
            el("th", { class: "heat-day", scope: "row", text: day.slice(0, 3) }),
            ...slots.map((s) => {
              const count = lookup.get(`${day}|${String(s.timeSlot)}`) || 0;
              return el("td", {
                class: `heat-cell heat-${band(count)}`,
                text: count || "",
                title: `${day} ${s.label}: ${count} class(es)`,
              });
            }),
          ])
        )
      )
    );

    return card("Timetable density", el("div", { class: "card-body heatmap" }, [table]));
  }

  function departmentCard(rows) {
    if (!rows.length) return null;
    return card(
      "By department",
      el("div", { class: "table-scroll" }, [
        (() => {
          const table = el("table", { class: "data-table" });
          table.appendChild(
            el("thead", {}, [
              el("tr", {}, [
                el("th", { text: "Code" }),
                el("th", { text: "Department" }),
                el("th", { class: "align-right", text: "Courses" }),
                el("th", { class: "align-right", text: "Teachers" }),
                el("th", { class: "align-right", text: "Students" }),
              ]),
            ])
          );
          table.appendChild(
            el(
              "tbody",
              {},
              rows.map((d) =>
                el("tr", {}, [
                  el("td", {}, [badge(d.code, "primary")]),
                  el("td", { text: d.name }),
                  el("td", { class: "align-right", text: String(d.courses) }),
                  el("td", { class: "align-right", text: String(d.teachers) }),
                  el("td", { class: "align-right", text: String(d.students) }),
                ])
              )
            )
          );
          return table;
        })(),
      ])
    );
  }

  /* ── Load ────────────────────────────────────────────────────────────────── */

  (async function load() {
    try {
      const { data } = await window.Api.get("/dashboard");

      const t = data.totals;
      const tiles = el("div", { class: "stat-grid" }, [
        statTile("Departments", t.departments),
        statTile("Teachers", t.teachers),
        statTile("Students", t.students),
        statTile("Courses", t.courses),
        statTile("Rooms", t.rooms),
        statTile("Scheduled classes", t.classes, `${data.teachersScheduled} teachers engaged`),
        statTile("Published routines", data.routinesByStatus.published, `${data.routinesByStatus.draft} in draft`),
        statTile("Awaiting approval", data.routinesByStatus.submitted),
      ]);

      window.UI.render(
        content,
        tiles,
        el("div", { class: "dashboard-columns" }, [
          todayCard(data.today),
          workloadCard(data.teacherWorkload || []),
          roomCard(data.roomUtilisation || { rooms: [] }),
          densityCard(data.slotDensity || {}),
          departmentCard(data.departments || []),
        ].filter(Boolean))
      );
    } catch (err) {
      window.UI.render(content, window.UI.errorState(err.message, load));
    }
  })();
})();
