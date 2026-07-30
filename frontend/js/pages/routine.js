/**
 * Routine editor — the weekly grid, the entry form, and the lifecycle controls.
 *
 * ── The live conflict check ────────────────────────────────────────────────
 * As soon as the form has enough to identify a slot, it calls
 * POST /routines/:id/check-conflicts, which writes nothing and returns the same
 * conflicts and warnings a save would produce. The user therefore sees a clash
 * BEFORE submitting, and the preview cannot disagree with the save because both
 * go through the same server-side service.
 *
 * ── Lifecycle buttons ─────────────────────────────────────────────────────
 * Which buttons exist is decided by two things together: the routine's
 * `allowedTransitions` (from the state machine) and the user's permissions. A
 * Department Admin sees Submit; only a Super Admin sees Approve and Publish.
 */
(function () {
  "use strict";

  if (!window.Auth.requireAuth()) return;

  const { el, toast, badge } = window.UI;
  const { idOf } = window.Fmt;

  const routineId = new URLSearchParams(window.location.search).get("routine");
  const canEdit = window.Auth.hasPermission(window.PERM.MANAGE_ROUTINE);

  const content = window.Layout.mount({ title: "Routine", subtitle: "" });

  if (!routineId) {
    window.UI.render(
      content,
      window.UI.emptyState(
        "No routine selected.",
        el("a", { class: "btn primary", href: "routines.html", text: "Choose a routine" })
      )
    );
    return;
  }

  /** Page state, so a reload after a save does not lose the section filter. */
  const state = { grid: null, refs: {}, section: "" };

  /* ── Lifecycle strip ─────────────────────────────────────────────────────── */

  const ORDER = ["draft", "submitted", "approved", "published"];

  function statusStrip(routine) {
    const current = ORDER.indexOf(routine.status);
    const steps = [];

    ORDER.forEach((step, i) => {
      if (i > 0) steps.push(el("span", { class: "status-arrow", "aria-hidden": "true", text: "→" }));
      steps.push(
        el("span", {
          class: `status-step${i < current ? " is-done" : ""}${i === current ? " is-current" : ""}`,
          text: window.Fmt.titleCase(step),
        })
      );
    });

    if (routine.status === "archived") {
      steps.push(el("span", { class: "status-arrow", text: "→" }), badge("Archived", "neutral"));
    }

    return el("div", { class: "status-strip" }, [
      ...steps,
      el("span", { class: "status-meta", text: `${routine.entryCount || 0} class(es)` }),
    ]);
  }

  /**
   * Buttons for the transitions that are BOTH legal from the current state and
   * permitted for this user.
   */
  function lifecycleActions(routine) {
    const map = {
      submitted: { label: "Submit for approval", permission: window.PERM.SUBMIT_ROUTINE, variant: "primary", path: "submit" },
      approved: { label: "Approve", permission: window.PERM.APPROVE_ROUTINE, variant: "success", path: "approve" },
      published: { label: "Publish", permission: window.PERM.PUBLISH_ROUTINE, variant: "success", path: "publish" },
      archived: { label: "Archive", permission: window.PERM.PUBLISH_ROUTINE, variant: "ghost", path: "archive" },
    };

    const buttons = (routine.allowedTransitions || [])
      .map((next) => {
        // "draft" as a target means rejection, which needs a reason.
        if (next === "draft") {
          if (!window.Auth.hasPermission(window.PERM.APPROVE_ROUTINE)) return null;
          return el("button", {
            class: "btn danger-ghost",
            type: "button",
            text: "Send back for revision",
            onClick: () => reject(),
          });
        }
        const cfg = map[next];
        if (!cfg || !window.Auth.hasPermission(cfg.permission)) return null;
        return el("button", {
          class: `btn ${cfg.variant}`,
          type: "button",
          text: cfg.label,
          onClick: () => transition(cfg.path, cfg.label),
        });
      })
      .filter(Boolean);

    return buttons;
  }

  async function transition(path, label) {
    const confirmed = await window.UI.confirmDialog({
      title: `${label}?`,
      message:
        path === "publish"
          ? "Publishing makes this routine visible to every affected teacher and student, and notifies them."
          : `This will ${label.toLowerCase()}.`,
      confirmLabel: label,
      danger: false,
    });
    if (!confirmed) return;

    try {
      await window.Api.post(`/routines/${routineId}/${path}`);
      toast(`Routine ${path === "submit" ? "submitted" : `${path}ed`}`, "success");
      load();
    } catch (err) {
      toast(err.message, "error", 8000);
    }
  }

  async function reject() {
    const form = el("form", { class: "form single" }, [
      el("div", { class: "form-group" }, [
        el("label", { for: "reason", text: "Reason (sent to whoever submitted it)" }),
        el("textarea", { id: "reason", name: "reason", rows: 3, maxLength: 500 }),
      ]),
    ]);

    const handle = window.UI.modal({
      title: "Send back for revision",
      body: form,
      footer: el("div", { class: "modal-actions" }, [
        el("button", { class: "btn ghost", type: "button", text: "Cancel", onClick: () => handle.close() }),
        el("button", {
          class: "btn danger",
          type: "button",
          text: "Send back",
          onClick: async () => {
            try {
              await window.Api.post(`/routines/${routineId}/reject`, { reason: form.reason.value.trim() });
              handle.close();
              toast("Sent back for revision", "success");
              load();
            } catch (err) {
              toast(err.message, "error");
            }
          },
        }),
      ]),
    });
  }

  /* ── Entry form ──────────────────────────────────────────────────────────── */

  function entryFields() {
    return [
      { name: "day", label: "Day", type: "select", options: window.DAYS, required: true },
      { name: "timeSlot", label: "Time slot", type: "ref", options: state.refs.timeSlots, labelKey: "label", required: true },
      { name: "section", label: "Section", type: "select", options: state.refs.sections, required: true },
      { name: "groupLabel", label: "Lab group", type: "text", default: "ALL", help: "ALL, or G1/G2 for a split lab." },
      { name: "course", label: "Course", type: "ref", options: state.refs.courses, labelKey: "label", required: true },
      { name: "teacher", label: "Teacher", type: "ref", options: state.refs.teachers, labelKey: "fullName", required: true },
      { name: "room", label: "Room", type: "ref", options: state.refs.rooms, labelKey: "code", required: true },
      { name: "classType", label: "Class type", type: "select", options: ["Lecture", "Lab", "Tutorial"], default: "Lecture" },
      { name: "note", label: "Note", type: "text", wide: true },
    ];
  }

  /**
   * @param {Object|null} entry    existing entry when editing
   * @param {Object|null} prefill  { day, timeSlot } when a grid cell was clicked
   */
  function openEntryForm(entry = null, prefill = null) {
    const fields = entryFields();
    const values = entry
      ? {
          day: entry.day,
          timeSlot: idOf(entry.timeSlot),
          section: entry.section,
          groupLabel: entry.groupLabel,
          course: idOf(entry.course),
          teacher: idOf(entry.teacher),
          room: idOf(entry.room),
          classType: entry.classType,
          note: entry.note,
        }
      : { ...(prefill || {}), groupLabel: "ALL", classType: "Lecture" };

    const form = window.UI.buildForm(fields, values);
    const feedback = el("div", { class: "entry-feedback" });
    form.appendChild(el("div", { class: "form-group-wide" }, [feedback]));

    const submit = el("button", {
      class: "btn primary",
      type: "submit",
      text: entry ? "Save changes" : "Add class",
    });

    const handle = window.UI.modal({
      title: entry ? "Edit class" : "Add class",
      body: form,
      wide: true,
      footer: el("div", { class: "modal-actions" }, [
        entry &&
          el("button", {
            class: "btn danger-ghost",
            type: "button",
            text: "Remove",
            onClick: () => removeEntry(entry, handle),
          }),
        el("button", { class: "btn ghost", type: "button", text: "Cancel", onClick: () => handle.close() }),
        submit,
      ].filter(Boolean)),
    });

    /**
     * Ask the server to evaluate the candidate without saving it. Debounced,
     * because it fires on every dropdown change.
     */
    const preview = window.UI.debounce(async () => {
      const values_ = window.UI.readForm(form, fields);
      // Not enough to identify a slot yet — nothing meaningful to check.
      if (!values_.day || !values_.timeSlot || !values_.section) {
        feedback.textContent = "";
        return;
      }

      try {
        const { data } = await window.Api.post(`/routines/${routineId}/check-conflicts`, {
          ...values_,
          excludeEntryId: entry ? idOf(entry) : undefined,
        });

        window.UI.render(
          feedback,
          ...[
            window.UI.alertList(data.conflicts, "error", "This clashes with an existing class:"),
            window.UI.alertList(data.warnings, "warning", "Worth checking:"),
            data.ok && !data.warnings.length
              ? el("div", { class: "alert alert-success", text: "No conflicts." })
              : null,
          ].filter(Boolean)
        );

        // A known clash cannot be saved, so the button says so.
        submit.disabled = !data.ok;
      } catch {
        feedback.textContent = "";
      }
    }, 350);

    form.addEventListener("change", preview);
    if (values.day && values.timeSlot) preview();

    submit.addEventListener("click", (event) => {
      event.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true }));
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      window.UI.clearFieldErrors(form);
      window.UI.busy(submit, true);

      try {
        const body = window.UI.readForm(form, fields);
        const result = entry
          ? await window.Api.put(`/routines/${routineId}/entries/${idOf(entry)}`, body)
          : await window.Api.post(`/routines/${routineId}/entries`, body);

        handle.close();
        const warnings = result.data?.warnings || [];
        toast(
          warnings.length ? `Saved with ${warnings.length} warning(s)` : "Class saved",
          warnings.length ? "warning" : "success"
        );
        load();
      } catch (err) {
        if (err.isValidation) {
          window.UI.showFieldErrors(form, err.errors);
        } else if (err.isConflict && Array.isArray(err.errors)) {
          // Render the clash list inline: it names the specific existing class,
          // which is far more useful than a toast the user has to remember.
          window.UI.render(feedback, window.UI.alertList(err.errors, "error", err.message));
        } else {
          toast(err.message, "error", 8000);
        }
      } finally {
        window.UI.busy(submit, false);
      }
    });
  }

  async function removeEntry(entry, handle) {
    const confirmed = await window.UI.confirmDialog({
      title: "Remove this class?",
      message: `${window.Fmt.labelOf(entry.course, "code")} on ${entry.day} will be removed from the routine.`,
      confirmLabel: "Remove",
    });
    if (!confirmed) return;

    try {
      await window.Api.del(`/routines/${routineId}/entries/${idOf(entry)}`);
      handle.close();
      toast("Class removed", "success");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  /* ── Load ────────────────────────────────────────────────────────────────── */

  async function loadReferenceData(departmentId, semesterId) {
    const [courses, teachers, rooms] = await Promise.all([
      window.Api.list("courses", { limit: 200, department: departmentId }),
      window.Api.list("teachers", { limit: 200, department: departmentId }),
      window.Api.list("rooms", { limit: 200 }),
    ]);

    state.refs.courses = courses.rows.map((c) => ({ ...c, label: `${c.code} — ${c.title}` }));
    state.refs.teachers = teachers.rows;
    state.refs.rooms = rooms.rows.map((r) => ({ ...r, code: `${r.code} (${r.capacity} seats)` }));
  }

  async function load() {
    window.UI.render(content, window.UI.spinner("Loading routine…"));

    try {
      const { data } = await window.Api.get(`/routines/${routineId}/grid`, state.section ? { section: state.section } : {});
      const { data: full } = await window.Api.get(`/routines/${routineId}`);

      state.refs.timeSlots = data.timeSlots;
      state.refs.sections = data.sections;

      const editable = canEdit && full.status === "draft";

      // Reference lists are only needed when the grid can be edited.
      if (editable && !state.refs.courses) {
        await loadReferenceData(idOf(full.department), idOf(full.semester));
      }

      document.getElementById("page-title").textContent = full.title;

      const sectionFilter = el("select", { class: "filter-select", "aria-label": "Section" }, []);
      sectionFilter.appendChild(el("option", { value: "", text: "All sections" }));
      (data.sections || []).forEach((s) =>
        sectionFilter.appendChild(el("option", { value: s, text: `Section ${s}`, selected: state.section === s }))
      );
      sectionFilter.addEventListener("change", (event) => {
        state.section = event.target.value;
        load();
      });

      const gridHost = el("div");

      window.UI.render(
        content,
        statusStrip(full),
        el("div", { class: "toolbar" }, [
          el("div", { class: "toolbar-left" }, [
            sectionFilter,
            full.rejectionReason
              ? el("span", { class: "badge badge-warning", text: `Sent back: ${full.rejectionReason}` })
              : null,
          ]),
          el("div", { class: "toolbar-right" }, [
            ...lifecycleActions(full),
            editable
              ? el("button", { class: "btn primary", type: "button", text: "Add class", onClick: () => openEntryForm() })
              : null,
            el("button", {
              class: "btn ghost",
              type: "button",
              text: "Print",
              onClick: () => window.print(),
            }),
          ].filter(Boolean)),
        ]),
        gridHost,
        window.RoutineGrid.legend(),
        !editable && canEdit
          ? el("p", {
              class: "small muted",
              text: `This routine is ${full.status}, so its classes cannot be edited. Only a draft is editable.`,
            })
          : null
      );

      const { conflicts } = window.RoutineGrid.render(gridHost, {
        entries: data.entries,
        timeSlots: data.timeSlots,
        days: data.days,
        editable,
        onCellClick: ({ day, timeSlot }) =>
          openEntryForm(null, { day, timeSlot, section: state.section || data.sections[0] }),
        onEntryClick: (entry) => openEntryForm(entry),
      });

      // Should be impossible — the indexes prevent it — so if it ever shows,
      // something has bypassed the API.
      if (conflicts) {
        toast(`${conflicts} cell(s) contain a double-booking. This should not happen — please report it.`, "error", 12000);
      }
    } catch (err) {
      window.UI.render(content, window.UI.errorState(err.message, load));
    }
  }

  load();
})();
