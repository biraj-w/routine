/**
 * The CRUD page engine. Attached to window.Crud.
 *
 * `Crud.createPage(config)` produces a complete management screen: toolbar with
 * debounced search and filters, sortable paginated table, create/edit modal,
 * delete confirmation, and error handling. Each of the eight master-data pages is
 * then 25–60 lines of declaration.
 *
 * It is the client-side counterpart to backend/src/utils/crudFactory.js, and the
 * reason ~15 vanilla-JS pages do not become 15 copies of the same 200 lines.
 *
 * What it handles that is easy to get wrong:
 *   - `Fmt.idOf` on every reference before it reaches a form or a payload, so a
 *     populated `{_id, name}` does not get posted back where an id is expected
 *   - 422 field errors pinned to the offending input rather than toasted
 *   - 409 shown verbatim, since the server's message names what is in the way
 *   - reference dropdown options fetched ONCE and cached across modal opens
 *   - filter and page state mirrored into the URL, so a refresh keeps its place
 */
(function () {
  "use strict";

  const { el, toast, modal, confirmDialog, spinner, emptyState, errorState } = window.UI;
  const { idOf, labelOf } = window.Fmt;

  /** Cache for reference dropdowns: resource → rows. */
  const refCache = new Map();

  async function loadOptions(resource, { limit = 200, query = {} } = {}) {
    const key = `${resource}:${JSON.stringify(query)}`;
    if (refCache.has(key)) return refCache.get(key);

    const { rows } = await window.Api.list(resource, { limit, ...query });
    refCache.set(key, rows);
    return rows;
  }

  /** Invalidate caches after a write, so a new department appears in dropdowns. */
  function clearOptionCache(resource = null) {
    if (!resource) return refCache.clear();
    [...refCache.keys()].filter((k) => k.startsWith(`${resource}:`)).forEach((k) => refCache.delete(k));
  }

  /**
   * @param {Object}   cfg
   * @param {string}   cfg.resource          API path segment, e.g. "courses"
   * @param {string}   cfg.title
   * @param {string}   [cfg.subtitle]
   * @param {string}   [cfg.singular]        for messages: "course"
   * @param {Object}   cfg.permissions       { view, create, update, delete }
   * @param {Array}    cfg.columns           [{ key, label, sortable, render, align }]
   * @param {Array}    [cfg.filters]         [{ key, label, type, resource, labelKey, options }]
   * @param {Array}    cfg.formFields        descriptors for UI.buildForm
   * @param {Function} [cfg.toPayload]       (values, mode, row) => body
   * @param {Function} [cfg.toFormValues]    (row) => values, for editing
   * @param {Array}    [cfg.rowActions]      extra per-row buttons
   * @param {string}   [cfg.searchPlaceholder]
   * @param {string}   [cfg.defaultSort]
   */
  function createPage(cfg) {
    const {
      resource,
      title,
      subtitle = "",
      singular = title.replace(/s$/, "").toLowerCase(),
      permissions = {},
      columns,
      filters = [],
      formFields,
      toPayload = (v) => v,
      toFormValues = (row) => row,
      rowActions = [],
      searchPlaceholder = "Search…",
      defaultSort = "",
    } = cfg;

    if (permissions.view && !window.Auth.requirePermission(permissions.view)) return;
    if (!permissions.view && !window.Auth.requireAuth()) return;

    const canCreate = permissions.create && window.Auth.hasPermission(permissions.create);
    const canUpdate = permissions.update && window.Auth.hasPermission(permissions.update);
    const canDelete = permissions.delete && window.Auth.hasPermission(permissions.delete);

    // ── State, seeded from the URL so a refresh or a shared link keeps context ──
    const url = new URLSearchParams(window.location.search);
    const state = {
      page: Number(url.get("page")) || 1,
      limit: Number(url.get("limit")) || 10,
      search: url.get("search") || "",
      sort: url.get("sort") || defaultSort,
      filters: {},
    };
    filters.forEach((f) => {
      state.filters[f.key] = url.get(f.key) || "";
    });

    function syncUrl() {
      const params = new URLSearchParams();
      if (state.page > 1) params.set("page", state.page);
      if (state.limit !== 10) params.set("limit", state.limit);
      if (state.search) params.set("search", state.search);
      if (state.sort) params.set("sort", state.sort);
      Object.entries(state.filters).forEach(([k, v]) => v && params.set(k, v));
      const query = params.toString();
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    }

    const newButton = canCreate
      ? el("button", { class: "btn primary", type: "button", text: `New ${singular}`, onClick: () => openForm("create") })
      : null;

    const content = window.Layout.mount({
      title,
      subtitle,
      actions: [newButton].filter(Boolean),
    });

    const tableHost = el("div", { class: "table-host" });
    const toolbar = buildToolbar();
    window.UI.render(content, toolbar, tableHost);

    /* ── Toolbar ──────────────────────────────────────────────────────────── */

    function buildToolbar() {
      const searchInput = el("input", {
        type: "search",
        class: "search-input",
        placeholder: searchPlaceholder,
        value: state.search,
        "aria-label": searchPlaceholder,
        onInput: window.UI.debounce((event) => {
          state.search = event.target.value.trim();
          state.page = 1; // a new search must not land on page 4 of the old one
          load();
        }, 350),
      });

      const filterNodes = filters.map((filter) => {
        const select = el("select", {
          class: "filter-select",
          "aria-label": filter.label,
          dataset: { filter: filter.key },
          onChange: (event) => {
            state.filters[filter.key] = event.target.value;
            state.page = 1;
            load();
          },
        });
        select.appendChild(el("option", { value: "", text: `All ${filter.label.toLowerCase()}` }));

        // Static options are available immediately; reference options arrive
        // asynchronously and are appended when they land.
        if (filter.options) {
          filter.options.forEach((opt) => {
            const value = typeof opt === "string" ? opt : idOf(opt);
            const label = typeof opt === "string" ? opt : labelOf(opt, filter.labelKey || "name");
            select.appendChild(
              el("option", { value, text: label, selected: state.filters[filter.key] === value })
            );
          });
        } else if (filter.resource) {
          loadOptions(filter.resource, { query: filter.query })
            .then((rows) => {
              rows.forEach((row) => {
                select.appendChild(
                  el("option", {
                    value: idOf(row),
                    text: labelOf(row, filter.labelKey || "name"),
                    selected: state.filters[filter.key] === idOf(row),
                  })
                );
              });
            })
            .catch(() => {
              /* a filter that cannot load simply stays at "All" */
            });
        }

        return select;
      });

      return el("div", { class: "toolbar" }, [
        el("div", { class: "toolbar-left" }, [searchInput, ...filterNodes]),
        el("div", { class: "toolbar-right" }, [
          el("span", { class: "result-count", id: "result-count" }),
        ]),
      ]);
    }

    /* ── Table ────────────────────────────────────────────────────────────── */

    function buildTable(rows) {
      const table = el("table", { class: "data-table" });

      const headRow = el("tr");
      columns.forEach((col) => {
        if (!col.sortable) {
          headRow.appendChild(el("th", { class: col.align ? `align-${col.align}` : null, text: col.label }));
          return;
        }
        const descending = state.sort === col.key;
        const arrow = state.sort === col.key ? " ▲" : state.sort === `-${col.key}` ? " ▼" : "";
        headRow.appendChild(
          el("th", { class: "sortable" }, [
            el("button", {
              class: "sort-button",
              type: "button",
              text: col.label + arrow,
              onClick: () => {
                state.sort = descending ? `-${col.key}` : col.key;
                load();
              },
            }),
          ])
        );
      });
      if (canUpdate || canDelete || rowActions.length) {
        headRow.appendChild(el("th", { class: "align-right", text: "Actions" }));
      }
      table.appendChild(el("thead", {}, [headRow]));

      const tbody = el("tbody");
      rows.forEach((row) => {
        const tr = el("tr");
        columns.forEach((col) => {
          const rendered = col.render ? col.render(row) : row[col.key];
          const td = el("td", { class: col.align ? `align-${col.align}` : null });
          // A render function may return a node or a plain value.
          if (rendered instanceof Node) td.appendChild(rendered);
          else td.textContent = rendered === null || rendered === undefined || rendered === "" ? "—" : String(rendered);
          tr.appendChild(td);
        });

        if (canUpdate || canDelete || rowActions.length) {
          const actions = el("td", { class: "align-right row-actions" });
          rowActions.forEach((action) => {
            if (action.permission && !window.Auth.hasPermission(action.permission)) return;
            if (action.visible && !action.visible(row)) return;
            actions.appendChild(
              el("button", {
                class: `btn tiny ${action.variant || "ghost"}`,
                type: "button",
                text: action.label,
                onClick: () => action.onClick(row, { reload: load }),
              })
            );
          });
          if (canUpdate) {
            actions.appendChild(
              el("button", { class: "btn tiny ghost", type: "button", text: "Edit", onClick: () => openForm("edit", row) })
            );
          }
          if (canDelete) {
            actions.appendChild(
              el("button", { class: "btn tiny danger-ghost", type: "button", text: "Delete", onClick: () => remove(row) })
            );
          }
          tr.appendChild(actions);
        }

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      return el("div", { class: "table-scroll" }, [table]);
    }

    function buildPagination(meta) {
      if (!meta || meta.totalPages <= 1) return null;

      const pageButton = (label, targetPage, { disabled = false, active = false } = {}) =>
        el("button", {
          class: `page-button${active ? " is-active" : ""}`,
          type: "button",
          text: label,
          disabled,
          onClick: () => {
            state.page = targetPage;
            load();
          },
        });

      const nodes = [pageButton("‹ Prev", meta.page - 1, { disabled: !meta.hasPrev })];

      // A window around the current page, so 40 pages do not produce 40 buttons.
      const from = Math.max(1, meta.page - 2);
      const to = Math.min(meta.totalPages, meta.page + 2);
      if (from > 1) nodes.push(pageButton("1", 1), el("span", { class: "page-gap", text: "…" }));
      for (let p = from; p <= to; p += 1) nodes.push(pageButton(String(p), p, { active: p === meta.page }));
      if (to < meta.totalPages) {
        nodes.push(el("span", { class: "page-gap", text: "…" }), pageButton(String(meta.totalPages), meta.totalPages));
      }

      nodes.push(pageButton("Next ›", meta.page + 1, { disabled: !meta.hasNext }));

      return el("div", { class: "pagination" }, [
        el("div", { class: "page-buttons" }, nodes),
        el("span", {
          class: "page-info",
          text: `Page ${meta.page} of ${meta.totalPages} · ${meta.total} total`,
        }),
      ]);
    }

    /* ── Load ─────────────────────────────────────────────────────────────── */

    async function load() {
      syncUrl();
      window.UI.render(tableHost, spinner(`Loading ${title.toLowerCase()}…`));

      try {
        const params = {
          page: state.page,
          limit: state.limit,
          search: state.search || undefined,
          sort: state.sort || undefined,
          ...Object.fromEntries(Object.entries(state.filters).filter(([, v]) => v)),
        };
        const { rows, meta } = await window.Api.list(resource, params);

        const counter = document.getElementById("result-count");
        if (counter) counter.textContent = meta.total === 1 ? "1 result" : `${meta.total} results`;

        if (!rows.length) {
          window.UI.render(
            tableHost,
            emptyState(
              state.search || Object.values(state.filters).some(Boolean)
                ? "No matches. Try clearing the search or filters."
                : `No ${title.toLowerCase()} yet.`,
              canCreate && !state.search
                ? el("button", { class: "btn primary", type: "button", text: `New ${singular}`, onClick: () => openForm("create") })
                : null
            )
          );
          return;
        }

        window.UI.render(tableHost, buildTable(rows), buildPagination(meta));
        // Re-applied after every render, so per-row buttons carrying
        // data-permission are filtered too.
        window.Layout.applyPermissions(tableHost);
      } catch (err) {
        window.UI.render(tableHost, errorState(err.message, load));
      }
    }

    /* ── Create / edit ────────────────────────────────────────────────────── */

    async function openForm(mode, row = null) {
      const isEdit = mode === "edit";

      // Resolve reference dropdowns before building the form, so it opens fully
      // populated rather than filling in visibly afterwards.
      const fields = await Promise.all(
        formFields.map(async (field) => {
          if (field.type !== "ref" || field.options) return field;
          try {
            const options = await loadOptions(field.resource, { query: field.query });
            return { ...field, options };
          } catch {
            return { ...field, options: [] };
          }
        })
      );

      const values = isEdit ? toFormValues(row) : {};
      const form = window.UI.buildForm(fields, values);

      const submit = el("button", { class: "btn primary", type: "submit", text: isEdit ? "Save changes" : `Create ${singular}` });

      const handle = modal({
        title: isEdit ? `Edit ${singular}` : `New ${singular}`,
        body: form,
        footer: el("div", { class: "modal-actions" }, [
          el("button", { class: "btn ghost", type: "button", text: "Cancel", onClick: () => handle.close() }),
          submit,
        ]),
        wide: fields.length > 6,
      });

      // The footer button submits the form, so Enter in a field works too.
      submit.addEventListener("click", (event) => {
        event.preventDefault();
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true }));
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        window.UI.clearFieldErrors(form);
        window.UI.busy(submit, true);

        try {
          const raw = window.UI.readForm(form, fields);
          const body = toPayload(raw, mode, row);

          if (isEdit) await window.Api.put(`/${resource}/${idOf(row)}`, body);
          else await window.Api.post(`/${resource}`, body);

          clearOptionCache(resource);
          handle.close();
          toast(isEdit ? `${singular} updated` : `${singular} created`, "success");
          load();
        } catch (err) {
          if (err.isValidation) {
            window.UI.showFieldErrors(form, err.errors);
          } else if (err.isConflict) {
            // The server's 409 message names the specific clash, so show it as-is.
            toast(err.message, "error", 8000);
          } else {
            toast(err.message, "error");
          }
        } finally {
          window.UI.busy(submit, false);
        }
      });
    }

    /* ── Delete ───────────────────────────────────────────────────────────── */

    async function remove(row) {
      const label = labelOf(row, "name") || labelOf(row, "code") || singular;

      const confirmed = await confirmDialog({
        title: `Delete ${singular}?`,
        message: `“${label}” will be removed. This is a soft delete — the record is retained for audit purposes but will no longer appear.`,
        confirmLabel: "Delete",
      });
      if (!confirmed) return;

      try {
        await window.Api.del(`/${resource}/${idOf(row)}`);
        clearOptionCache(resource);
        toast(`${singular} deleted`, "success");

        // Deleting the only row on the last page would otherwise show an empty page.
        load();
      } catch (err) {
        // 409 here means other records still reference it; the message lists them.
        toast(err.message, "error", err.isConflict ? 9000 : 5000);
      }
    }

    load();

    return { reload: load, openForm, state };
  }

  window.Crud = { createPage, loadOptions, clearOptionCache };
})();
