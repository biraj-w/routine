/**
 * Client-side session state and page guards. Attached to window.Auth.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Everything here is COSMETIC. hasPermission() decides which buttons appear;
 *  it decides nothing about what is allowed. The server re-derives the caller's
 *  permissions from the database on every single request, so editing
 *  localStorage grants nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ── Why localStorage, and what it costs ────────────────────────────────────
 * Tokens are kept in localStorage rather than httpOnly cookies. The honest
 * trade-off: a cookie cannot be read by injected script, so it resists XSS,
 * whereas localStorage can. It is used here because the tokens must be attached
 * as an Authorization header from plain JavaScript with no build step.
 *
 * The exposure is mitigated rather than ignored: access tokens live 15 minutes,
 * refresh tokens are revocable server-side and rotate on every use, and the UI
 * never builds HTML from server data (see ui.js el(), which sets textContent),
 * so there is no injection point to begin with. Documented in
 * docs/architecture.md as a known limitation.
 */
(function () {
  "use strict";

  const KEY_ACCESS = "rms.accessToken";
  const KEY_REFRESH = "rms.refreshToken";
  const KEY_USER = "rms.user";

  const LOGIN_PAGE = "/pages/login.html";

  function getAccessToken() {
    return localStorage.getItem(KEY_ACCESS);
  }

  function getRefreshToken() {
    return localStorage.getItem(KEY_REFRESH);
  }

  /** The user object returned by /auth/login and /auth/me. */
  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(KEY_USER) || "null");
    } catch {
      return null;
    }
  }

  function saveSession({ accessToken, refreshToken, user }) {
    if (accessToken) localStorage.setItem(KEY_ACCESS, accessToken);
    if (refreshToken) localStorage.setItem(KEY_REFRESH, refreshToken);
    if (user) localStorage.setItem(KEY_USER, JSON.stringify(user));
  }

  function clear() {
    localStorage.removeItem(KEY_ACCESS);
    localStorage.removeItem(KEY_REFRESH);
    localStorage.removeItem(KEY_USER);
  }

  /**
   * Decode a JWT payload WITHOUT verifying it.
   *
   * Only ever used to read `exp` for a client-side expiry hint. The signature is
   * not and cannot be checked here — that is the server's job, and treating this
   * output as trustworthy would be the mistake this comment exists to prevent.
   */
  function decodeJwt(token = getAccessToken()) {
    if (!token) return null;
    try {
      const [, payload] = token.split(".");
      // base64url → base64 before decoding.
      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  /** True when the stored access token has already expired. */
  function isAccessTokenExpired() {
    const payload = decodeJwt();
    if (!payload?.exp) return true;
    return payload.exp * 1000 <= Date.now();
  }

  /** Do we have any credential at all? An expired access token is fine — api.js refreshes. */
  function isLoggedIn() {
    return Boolean(getAccessToken() && getRefreshToken() && getUser());
  }

  /* ── Permission helpers ─────────────────────────────────────────────────── */

  function permissions() {
    return getUser()?.permissions || [];
  }

  function hasPermission(permission) {
    return permissions().includes(permission);
  }

  function hasAnyPermission(list) {
    const wanted = Array.isArray(list) ? list : [list];
    const held = permissions();
    return wanted.some((p) => held.includes(p));
  }

  function hasRole(...names) {
    const role = getUser()?.role?.name;
    return names.flatMap((n) => String(n).split(",")).map((s) => s.trim()).includes(role);
  }

  function roleName() {
    return getUser()?.role?.name || "";
  }

  function departmentId() {
    return getUser()?.department?.id || null;
  }

  /* ── Page guards ────────────────────────────────────────────────────────── */

  /**
   * Call at the top of every protected page:
   *
   *   if (!Auth.requireAuth()) return;
   *
   * Redirects to login with `next`, so the user lands back where they were
   * heading after signing in.
   */
  function requireAuth() {
    if (isLoggedIn()) return true;
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`${LOGIN_PAGE}?next=${next}`);
    return false;
  }

  /**
   * Guard a page by permission. A logged-in user without it goes to the
   * dashboard with an explanation — not to the login page, which would imply
   * their session was the problem.
   */
  function requirePermission(permission) {
    if (!requireAuth()) return false;
    if (hasAnyPermission(permission)) return true;

    sessionStorage.setItem(
      "rms.flash",
      JSON.stringify({
        type: "error",
        message: "You do not have permission to view that page.",
      })
    );
    window.location.replace("/pages/dashboard.html");
    return false;
  }

  /** Revoke the session server-side, then clear and redirect. */
  async function logout({ expired = false, silent = false } = {}) {
    // Best effort: even if the call fails, the local credentials must go.
    if (!expired && getAccessToken()) {
      try {
        await window.Api.post("/auth/logout");
      } catch {
        /* already invalid — nothing to do */
      }
    }
    clear();

    if (silent) return;
    const params = expired ? "?expired=1" : "";
    window.location.replace(LOGIN_PAGE + params);
  }

  /** Refresh the cached user, e.g. after a profile edit or a permission change. */
  async function reloadUser() {
    const { data } = await window.Api.get("/auth/me");
    if (data?.user) saveSession({ user: data.user });
    return data?.user || null;
  }

  window.Auth = {
    saveSession,
    clear,
    getAccessToken,
    getRefreshToken,
    getUser,
    decodeJwt,
    isAccessTokenExpired,
    isLoggedIn,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasRole,
    roleName,
    departmentId,
    requireAuth,
    requirePermission,
    logout,
    reloadUser,
    LOGIN_PAGE,
  };
})();
