import { sameOrigin } from "@/utils/origin";

/**
 * A message from the sign in web view: the session token, "empty" when the
 * page signed in but sent none, or null when it is not a handoff. Only the
 * server's own pages may hand over a session; any other page reached in
 * there (a sign in provider, a link) is ignored.
 */
export function readHandoff(
  data: string,
  pageUrl: string | undefined,
  serverUrl: string,
): { token: string } | "empty" | null {
  if (!sameOrigin(pageUrl, serverUrl)) return null;
  try {
    const msg = JSON.parse(data);
    if (msg?.type !== "AUTH_SUCCESS") return null;
    if (!msg.token || String(msg.token).length < 20) return "empty";
    return { token: String(msg.token) };
  } catch {
    return null;
  }
}

/**
 * Runs in the sign in web view. The web app keeps its session in an HttpOnly
 * cookie, so this asks /users/me/token for it after a callback page loads and
 * posts it back to the app. Leftover readable tokens are cleared first, so the
 * previous account can't be handed back.
 */
export const TOKEN_HANDOFF_SCRIPT = `
    (function() {
      const isCallback = window.location.href.includes('/oidc/callback') ||
                         window.location.href.includes('?success=') ||
                         window.location.href.includes('?error=');

      // On a fresh (non-callback) page load, drop any JS-readable leftover token
      // so the web app doesn't silently resume the PREVIOUS account - otherwise
      // an OIDC sign-in can hand back the old user's token. (HttpOnly cookies
      // can't be cleared here, but this covers the localStorage/readable-cookie
      // case the web app uses for the handoff.)
      if (!isCallback) {
        try {
          localStorage.removeItem('jwt');
          sessionStorage.removeItem('jwt');
          document.cookie.split(';').forEach(function(c) {
            const name = c.split('=')[0].trim();
            if (name === 'jwt') {
              document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;';
              document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=' + window.location.hostname;
            }
          });
        } catch (e) {}
      }

      let hasNotified = false;
      let initialCheckComplete = false;

      const notifyAuth = (token) => {
        if (hasNotified || !token || token.length < 20) return;
        if (!isCallback && !initialCheckComplete) return;
        hasNotified = true;
        try {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'AUTH_SUCCESS', token: token })
          );
        } catch (e) {}
      };

      // Primary recovery path: the web app authenticates via an HttpOnly cookie,
      // which JS cannot read. A same-origin credentialed fetch to /users/me/token
      // sends that cookie automatically and returns the JWT in the body.
      const fetchTokenFromServer = () => {
        if (hasNotified) return;
        // Try the origin root first (standard nginx routes the API there), then
        // a path relative to the current document directory (sub-path mounts).
        const dir = window.location.pathname.replace(/[^/]*$/, '');
        const candidates = ['/users/me/token', dir + 'users/me/token'];
        candidates.forEach((url) => {
          try {
            fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => { if (d && d.token) notifyAuth(d.token); })
              .catch(() => {});
          } catch (e) {}
        });
      };

      const checkAuth = () => {
        try {
          // Secondary fallbacks. Note: an HttpOnly 'jwt' cookie is invisible to
          // document.cookie, so that scrape is a no-op for the standard flow and
          // only catches non-HttpOnly storage some setups may use.
          const ls = localStorage.getItem('jwt');
          if (ls) { notifyAuth(ls); return true; }
          const ss = sessionStorage.getItem('jwt');
          if (ss) { notifyAuth(ss); return true; }
          const m = document.cookie.split('; ').find(r => r.startsWith('jwt='));
          if (m) { notifyAuth(m.split('=')[1]); return true; }
        } catch (e) {}
        return false;
      };

      const origSet = localStorage.setItem;
      localStorage.setItem = function(k, v) {
        origSet.apply(this, arguments);
        if (k === 'jwt' && v && !hasNotified) checkAuth();
      };

      const id = setInterval(() => {
        if (hasNotified) { clearInterval(id); return; }
        if (checkAuth()) clearInterval(id);
        else if (isCallback) fetchTokenFromServer();
      }, 500);
      checkAuth();
      if (isCallback) fetchTokenFromServer();
      setTimeout(() => { initialCheckComplete = true; }, 1000);
      setTimeout(() => clearInterval(id), 120000);
    })();
    true;
`;
