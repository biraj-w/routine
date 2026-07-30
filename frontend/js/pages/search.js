/**
 * Routine search — by teacher, room, course, department, semester or day.
 *
 * Available to every role. The server restricts results to published routines for
 * anyone without "View Routine", so a student searching cannot see a draft.
 */
(function () {
  "use strict";

  if (!window.Auth.requirePermission([window.PERM.SEARCH_ROUTINE, window.PERM.VIEW_ROUTINE])) return;

  const { el } = window.UI;
  const { idOf, labelOf } = window.Fmt;

  const content = window.Layout.mount({
    title: "Search routine",
    subtitle: "Find classes by teacher, room, course, day or cohort. Combine filters to narrow the result.",
  });

  const filters = [
    { key: "teacher", label: "Teacher", resource: "teachers", labelKey: "fullName" },
    { key: "course", label: "Course", resource: "courses", labelKey: "label", map: (c) => ({ ...c, label: `${c.code} — ${c.title}` }) },
    { key: "room", label: "Room", resource: "rooms", labelKey: "code" },
    { key: "department", label: "Department", resource: "departments", labelKey: "name" },
    { key: "semester", label: "Semester", resource: "semesters", labelKey: "label" },
  ];

  const state = { page: 1 };
  const url = new URLSearchParams(window.location.search);
  filters.forEach((f) => {
    state[f.key] = url.get(f.key) || "";
  });
  state.day = url.get("day") || "";
  state.section = url.get("section") || "";

  const resultHost = el("div", { class: "table-host" });
  const toolbar = el("div", { class: "toolbar" });

  window.UI.render(content, toolbar, resultHost);

  /** Build the filter bar, populating reference dropdowns as they arrive. */
  async function buildToolbar() {
    const left = el("div", { class: "toolbar-left" });

    for (const filter of filters) {
      const select = el("select", { class: "filter-select", "aria-label": filter.label });
      select.appendChild(el("option", { value: "", text: filter.label }));
      left.appendChild(select);

      // Populated asynchronously so the bar renders immediately.
      window.Api.list(filter.resource, { limit: 200 })
        .then(({ rows }) => {
          rows.map(filter.map || ((r) => r)).forEach((row) => {
            select.appendChild(
              el("option", {
                value: idOf(row),
                text: labelOf(row, filter.labelKey),
                selected: state[filter.key] === idOf(row),
              })
            );
          });
        })
        .catch(() => {
          // A filter the caller may not read simply stays empty rather than
          // breaking the page — a student cannot list teachers, for instance.
          select.disabled = true;
        });

      select.addEventListener("change", (event) => {
        state[filter.key] = event.target.value;
        state.page = 1;
        run();
      });
    }

    const daySelect = el("select", { class: "filter-select", "aria-label": "Day" });
    daySelect.appendChild(el("option", { value: "", text: "Any day" }));
    window.DAYS.forEach((d) =>
      daySelect.appendChild(el("option", { value: d, text: d, selected: state.day === d }))
    );
    daySelect.addEventListener("change", (event) => {
      state.day = event.target.value;
      state.page = 1;
      run();
    });
    left.appendChild(daySelect);

    const clear = el("button", {
      class: "btn ghost small",
      type: "button",
      text: "Clear",
      onClick: () => {
        window.location.href = "search.html";
      },
    });

    window.UI.render(
      toolbar,
      left,
      el("div", { class: "toolbar-right" }, [el("span", { class: "result-count", id: "count" }), clear])
    );
  }

  function activeFilters() {
    const out = {};
    [...filters.map((f) => f.key), "day", "section"].forEach((key) => {
      if (state[key]) out[key] = state[key];
    });
    return out;
  }

  async function run() {
    const active = activeFilters();

    // Reflect the query in the URL so a search can be bookmarked or shared.
    const params = new URLSearchParams(active);
    window.history.replaceState(null, "", params.toString() ? `?${params}` : "search.html");

    if (!Object.keys(active).length) {
      window.UI.render(resultHost, window.UI.emptyState("Choose at least one filter to search."));
      const count = document.getElementById("count");
      if (count) count.textContent = "";
      return;
    }

    window.UI.render(resultHost, window.UI.spinner("Searching…"));

    try {
      const { data, meta } = await window.Api.get("/routines/search", {
        ...active,
        page: state.page,
        limit: 25,
      });

      const count = document.getElementById("count");
      if (count) count.textContent = meta.total === 1 ? "1 class" : `${meta.total} classes`;

      if (!data.length) {
        window.UI.render(resultHost, window.UI.emptyState("No classes match those filters."));
        return;
      }

      const table = el("table", { class: "data-table" });
      table.appendChild(
        el("thead", {}, [
          el("tr", {}, [
            el("th", { text: "Day" }),
            el("th", { text: "Time" }),
            el("th", { text: "Course" }),
            el("th", { text: "Teacher" }),
            el("th", { text: "Room" }),
            el("th", { text: "Cohort" }),
            el("th", { text: "Type" }),
          ]),
        ])
      );
      table.appendChild(
        el(
          "tbody",
          {},
          data.map((e) =>
            el("tr", {}, [
              el("td", { text: e.day }),
              el("td", { class: "mono", text: labelOf(e.timeSlot, "label") }),
              el("td", { text: `${labelOf(e.course, "code")} — ${labelOf(e.course, "title")}` }),
              el("td", { text: labelOf(e.teacher, "fullName") }),
              el("td", { text: labelOf(e.room, "code") }),
              el("td", {
                text:
                  `${labelOf(e.department, "code")} · L${e.semester?.number ?? "?"} · ${e.section}` +
                  (e.groupLabel && e.groupLabel !== "ALL" ? ` (${e.groupLabel})` : ""),
              }),
              el("td", {}, [window.UI.badge(e.classType, e.classType === "Lab" ? "success" : "primary")]),
            ])
          )
        )
      );

      const pager =
        meta.totalPages > 1
          ? el("div", { class: "pagination" }, [
              el("div", { class: "page-buttons" }, [
                el("button", {
                  class: "page-button",
                  type: "button",
                  text: "‹ Prev",
                  disabled: !meta.hasPrev,
                  onClick: () => {
                    state.page -= 1;
                    run();
                  },
                }),
                el("button", {
                  class: "page-button",
                  type: "button",
                  text: "Next ›",
                  disabled: !meta.hasNext,
                  onClick: () => {
                    state.page += 1;
                    run();
                  },
                }),
              ]),
              el("span", { class: "page-info", text: `Page ${meta.page} of ${meta.totalPages}` }),
            ])
          : null;

      window.UI.render(resultHost, el("div", { class: "table-scroll" }, [table]), pager);
    } catch (err) {
      window.UI.render(resultHost, window.UI.errorState(err.message, run));
    }
  }

  buildToolbar().then(run);
})();
