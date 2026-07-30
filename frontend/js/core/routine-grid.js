/**
 * Weekly routine grid. Attached to window.RoutineGrid.
 *
 * Pivots a flat array of entries into a days × slots table.
 *
 * ── Two decisions that keep this correct ───────────────────────────────────
 *
 * 1. Cells hold ARRAYS, not single entries.
 *    The obvious implementation is `cells[key] = entry`, which silently discards
 *    a row whenever two entries land in the same cell — exactly the situation the
 *    grid most needs to make visible. With arrays, a legitimate split lab renders
 *    as two cards side by side, and a genuine double-booking renders with a
 *    warning marker instead of disappearing.
 *
 * 2. Cells are keyed by timeSlot ID, never by a parsed time string.
 *    Comparing "09:00" strings invites timezone and format bugs; the slot
 *    catalogue gives every period a stable identity, so the pivot is a Map
 *    lookup.
 *
 * No multi-slot merging: a two-hour lab is two consecutive entries rather than
 * one cell with rowspan/colspan arithmetic. Documented as a known limitation in
 * the README — colspan maths across a sparse grid is where renderers like this
 * usually break.
 */
(function () {
  "use strict";

  const { el } = window.UI;
  const { idOf } = window.Fmt;

  const cellKey = (day, timeSlotId) => `${day}|${timeSlotId}`;

  /** Group entries by (day, slot). */
  function pivot(entries) {
    const map = new Map();
    (entries || []).forEach((entry) => {
      const key = cellKey(entry.day, idOf(entry.timeSlot));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    });
    return map;
  }

  /** One class, rendered as a card. */
  function entryCard(entry, { editable, onEntryClick }) {
    const course = entry.course || {};
    const teacher = entry.teacher || {};
    const room = entry.room || {};

    const isSplit = entry.groupLabel && entry.groupLabel !== "ALL";
    const type = (entry.classType || "Lecture").toLowerCase();

    const card = el(
      editable ? "button" : "div",
      {
        class: `grid-card type-${type}${editable ? " is-clickable" : ""}`,
        type: editable ? "button" : null,
        title: `${course.code || ""} ${course.title || ""}`.trim(),
        onClick: editable && onEntryClick ? () => onEntryClick(entry) : null,
      },
      [
        el("span", { class: "card-code", text: course.code || "—" }),
        el("span", { class: "card-teacher", text: teacher.fullName || "—" }),
        el("span", { class: "card-room", text: room.code || "—" }),
        isSplit ? el("span", { class: "card-group", text: entry.groupLabel }) : null,
      ]
    );

    return card;
  }

  /**
   * Render the grid into a container.
   *
   * @param {HTMLElement} container
   * @param {Object} options
   * @param {Array}  options.entries
   * @param {Array}  options.timeSlots   sorted by `order`
   * @param {Array}  [options.days]
   * @param {boolean} [options.editable] show "+" on empty cells
   * @param {Function} [options.onCellClick] ({day, timeSlot}) => void
   * @param {Function} [options.onEntryClick] (entry) => void
   */
  function render(container, {
    entries = [],
    timeSlots = [],
    days = window.DAYS,
    editable = false,
    onCellClick = null,
    onEntryClick = null,
  } = {}) {
    if (!timeSlots.length) {
      window.UI.render(
        container,
        window.UI.emptyState("No time slots are configured yet, so there is no grid to draw.")
      );
      return { conflicts: 0 };
    }

    const cells = pivot(entries);
    let conflictCount = 0;

    const table = el("table", { class: "routine-grid" });

    // Header: one column per period.
    const headRow = el("tr", {}, [el("th", { class: "grid-corner", text: "Day / Period" })]);
    timeSlots.forEach((slot) => {
      headRow.appendChild(
        el("th", { class: slot.isBreak ? "grid-slot is-break" : "grid-slot" }, [
          el("span", { class: "slot-label", text: slot.label }),
          slot.isBreak ? el("small", { text: "break" }) : null,
        ])
      );
    });
    table.appendChild(el("thead", {}, [headRow]));

    const tbody = el("tbody");
    days.forEach((day) => {
      const row = el("tr", {}, [el("th", { class: "grid-day", scope: "row", text: day })]);

      timeSlots.forEach((slot) => {
        const slotId = idOf(slot);
        const items = cells.get(cellKey(day, slotId)) || [];

        // More than one entry in a cell is only legitimate when the lab groups
        // differ. Anything else is a real clash and is marked.
        const groups = new Set(items.map((i) => i.groupLabel || "ALL"));
        const isConflict = items.length > 1 && groups.size !== items.length;
        if (isConflict) conflictCount += 1;

        const classes = [
          "grid-cell",
          slot.isBreak ? "is-break" : "",
          items.length ? "has-entries" : "is-empty",
          isConflict ? "has-conflict" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const cell = el("td", { class: classes });

        if (items.length) {
          if (isConflict) {
            cell.appendChild(
              el("span", { class: "conflict-flag", title: "Double-booked", text: "⚠" })
            );
          }
          items.forEach((entry) => cell.appendChild(entryCard(entry, { editable, onEntryClick })));
        } else if (editable && !slot.isBreak && onCellClick) {
          // Clicking an empty cell opens the form PREFILLED with this day and
          // slot, which is the difference between a grid you read and one you use.
          cell.appendChild(
            el("button", {
              class: "cell-add",
              type: "button",
              "aria-label": `Add a class on ${day} at ${slot.label}`,
              text: "+",
              onClick: () => onCellClick({ day, timeSlot: slotId, slot }),
            })
          );
        }

        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    window.UI.render(container, el("div", { class: "grid-scroll" }, [table]));
    return { conflicts: conflictCount };
  }

  /** Colour key, so the class-type shading means something. */
  function legend() {
    return el("div", { class: "grid-legend" }, [
      el("span", { class: "legend-item" }, [el("span", { class: "swatch type-lecture" }), "Lecture"]),
      el("span", { class: "legend-item" }, [el("span", { class: "swatch type-lab" }), "Lab"]),
      el("span", { class: "legend-item" }, [el("span", { class: "swatch type-tutorial" }), "Tutorial"]),
      el("span", { class: "legend-item" }, [el("span", { class: "swatch is-conflict-swatch" }), "Conflict"]),
    ]);
  }

  window.RoutineGrid = { render, legend, pivot };
})();
