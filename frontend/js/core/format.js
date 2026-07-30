/**
 * Small formatting and shape helpers. Attached to window.Fmt.
 */
(function () {
  "use strict";

  /**
   * Reduce a value to an id string.
   *
   * The API populates references, so `entry.course` may be an ObjectId string on
   * one response and `{ _id, code, title }` on another — while a PUT expects the
   * bare id. Reading a populated object straight into a form field is the small
   * bug that makes every edit silently fail validation, so every place that puts
   * a reference into a form or a payload goes through here.
   */
  function idOf(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    return String(value.id || value._id || "");
  }

  /** Human label for a possibly-populated reference. */
  function labelOf(value, key = "name", fallback = "—") {
    if (!value) return fallback;
    if (typeof value === "string") return value;
    return value[key] || value.label || value.title || value.code || fallback;
  }

  /** Two labels joined, e.g. "CSE301 — Web Engineering". */
  function labelPair(value, keyA, keyB, sep = " — ") {
    if (!value || typeof value === "string") return "—";
    const a = value[keyA];
    const b = value[keyB];
    return [a, b].filter(Boolean).join(sep) || "—";
  }

  function date(value, fallback = "—") {
    if (!value) return fallback;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function dateTime(value, fallback = "—") {
    if (!value) return fallback;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  /** "3 minutes ago", for activity logs and session lists. */
  function relative(value) {
    if (!value) return "—";
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return "—";

    const seconds = Math.round((Date.now() - then) / 1000);
    if (seconds < 60) return "just now";

    const steps = [
      [60, "minute"],
      [24, "hour"],
      [7, "day"],
      [4.35, "week"],
      [12, "month"],
    ];
    let value_ = seconds / 60;
    let unit = "minute";
    for (let i = 1; i < steps.length; i += 1) {
      if (value_ < steps[i][0]) break;
      value_ /= steps[i][0];
      unit = steps[i][1];
    }
    const n = Math.round(value_);
    return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  }

  /**
   * Parse a device string into something readable.
   * Deliberately crude — this is for a "your devices" list, not analytics.
   */
  function device(userAgent) {
    if (!userAgent) return "Unknown device";
    const browser =
      /Edg\//.test(userAgent) ? "Edge"
      : /OPR\//.test(userAgent) ? "Opera"
      : /Chrome\//.test(userAgent) ? "Chrome"
      : /Safari\//.test(userAgent) ? "Safari"
      : /Firefox\//.test(userAgent) ? "Firefox"
      : /curl/i.test(userAgent) ? "curl"
      : "Browser";
    const os =
      /Windows/.test(userAgent) ? "Windows"
      : /Android/.test(userAgent) ? "Android"
      : /iPhone|iPad/.test(userAgent) ? "iOS"
      : /Mac OS/.test(userAgent) ? "macOS"
      : /Linux/.test(userAgent) ? "Linux"
      : "";
    return os ? `${browser} on ${os}` : browser;
  }

  /** Title-case a status or enum value for display. */
  function titleCase(str) {
    if (!str) return "";
    return String(str).charAt(0).toUpperCase() + String(str).slice(1);
  }

  /**
   * Escape for the rare case where a template string is genuinely easier than
   * building nodes. Prefer UI.el(), which sets textContent and cannot inject.
   */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
  }

  /** Build a query string, omitting empty values so filters compose cleanly. */
  function qs(params) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") return;
      search.append(key, value);
    });
    const str = search.toString();
    return str ? `?${str}` : "";
  }

  window.Fmt = {
    idOf, labelOf, labelPair, date, dateTime, relative, device, titleCase, escapeHtml, qs,
  };
})();
