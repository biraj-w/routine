/**
 * The single fetch wrapper. Attached to window.Api.
 *
 * Every API call in the application goes through request(), so the Bearer
 * header, envelope unwrapping, and the 401 → refresh → retry dance exist in
 * exactly one place.
 *
 * ── Silent refresh, single-flight ──────────────────────────────────────────
 * Access tokens last 15 minutes. When one expires the server answers 401 with
 * code TOKEN_EXPIRED; this module then exchanges the refresh token for a new
 * pair and REPLAYS the original request, so the user never sees an interruption.
 *
 * The refresh is single-flight: if a page fires five requests at once and all
 * five get TOKEN_EXPIRED, they await ONE refresh rather than starting five. That
 * matters more here than for a typical wrapper, because the backend rotates
 * refresh tokens and treats a replayed one as theft — five concurrent refreshes
 * would look like an attack and revoke every session.
 *
 * ── 403 is not 401 ─────────────────────────────────────────────────────────
 * A 403 throws and is surfaced as a toast; it never redirects. Silently bouncing
 * the user to the login page on a permission error hides genuine bugs and is
 * baffling to use.
 */
(function () {
  "use strict";

  const BASE = "/api"; // relative: the API and the UI share an origin

  /** Error carrying the envelope's status, code and field errors. */
  class ApiError extends Error {
    constructor(status, message, code, errors) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code || null;
      this.errors = errors || null;
    }

    /** True when the server rejected specific fields, so a form can mark them. */
    get isValidation() {
      return this.status === 422 && Array.isArray(this.errors);
    }

    /** True for a routine clash, which pages render as a list rather than a toast. */
    get isConflict() {
      return this.status === 409;
    }
  }

  /** In-flight refresh, shared by every caller that needs one. */
  let refreshing = null;

  async function performRefresh() {
    const refreshToken = window.Auth.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || !payload.success) return false;

      window.Auth.saveSession({
        accessToken: payload.data.accessToken,
        refreshToken: payload.data.refreshToken,
        user: payload.data.user,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @param {string} method
   * @param {string} path    e.g. "/departments"
   * @param {Object} options { body, query, auth, retry }
   * @returns {Promise<{data, meta, message}>}
   */
  async function request(method, path, { body, query, auth = true, retry = true } = {}) {
    const url = BASE + path + window.Fmt.qs(query);
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const token = window.Auth.getAccessToken();
    if (auth && token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      // Network-level failure: no response at all.
      throw new ApiError(0, "Cannot reach the server. Is it running?", "NETWORK_ERROR");
    }

    if (res.status === 204) return { data: null, meta: null, message: "" };

    const payload = await res.json().catch(() => ({}));

    if (res.ok && payload.success !== false) {
      return { data: payload.data, meta: payload.meta || null, message: payload.message || "" };
    }

    // ── Expired access token: refresh once, then replay ────────────────────
    if (res.status === 401 && payload.code === "TOKEN_EXPIRED" && retry && auth) {
      refreshing = refreshing || performRefresh();
      const ok = await refreshing;
      refreshing = null;

      if (ok) return request(method, path, { body, query, auth, retry: false });

      window.Auth.logout({ expired: true });
      throw new ApiError(401, "Your session has ended. Please log in again.", payload.code);
    }

    // ── Any other 401: the session is genuinely gone ───────────────────────
    if (res.status === 401 && auth) {
      window.Auth.logout({ expired: true });
      throw new ApiError(401, payload.message || "Please log in again.", payload.code);
    }

    throw new ApiError(
      res.status,
      payload.message || `Request failed (${res.status})`,
      payload.code,
      payload.errors
    );
  }

  window.Api = {
    ApiError,
    request,
    get: (path, query) => request("GET", path, { query }),
    post: (path, body) => request("POST", path, { body }),
    put: (path, body) => request("PUT", path, { body }),
    patch: (path, body) => request("PATCH", path, { body }),
    del: (path) => request("DELETE", path),

    /** Unauthenticated calls: login, register, password reset. */
    postPublic: (path, body) => request("POST", path, { body, auth: false }),

    /** List helper: returns rows and pagination meta together. */
    list: async (resource, params) => {
      const { data, meta } = await request("GET", `/${resource}`, { query: params });
      return { rows: data || [], meta: meta || { page: 1, limit: 10, total: 0, totalPages: 1 } };
    },
  };
})();
