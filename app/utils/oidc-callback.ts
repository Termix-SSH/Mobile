// Hand-off point for the `termix-mobile://oidc-callback` deep link.
//
// The link normally never reaches the router: WebBrowser.openAuthSessionAsync
// captures the redirect and returns it as result.url, and the Linking listener
// in OidcStep is the backup. But Android can deliver it as a plain intent — a
// Custom Tab handing the redirect to the OS, or a cold start from a browser
// that outlived the process — and then expo-router resolves it as the path
// "/oidc-callback". app/oidc-callback.tsx exists so that path is a real route
// instead of the Unmatched Route screen, and parks the URL here for OidcStep to
// consume, so the token is never dropped just because the sign-in screen was
// not mounted when the intent arrived.
//
// The callback URL carries a bearer token in its query string, so nothing here
// keeps one: the parked URL is cleared as soon as it is consumed, and the
// already-handled check works on a fingerprint rather than the URL itself.

const MAX_TRACKED = 8;

let pendingCallbackUrl: string | null = null;
const handledFingerprints: number[] = [];
const processingFingerprints = new Set<number>();

/** djb2. Not a security primitive — only used to avoid retaining tokens. */
function fingerprint(url: string): number {
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) | 0;
  }
  return hash;
}

/** Park a callback URL that arrived while no sign-in screen was listening. */
export function rememberOidcCallback(url: string): void {
  if (isOidcCallbackHandled(url) || isOidcCallbackProcessing(url)) return;
  pendingCallbackUrl = url;
}

/** Take the parked URL, if any. Returns it once and only once. */
export function consumeOidcCallback(): string | null {
  const url = pendingCallbackUrl;
  pendingCallbackUrl = null;
  return url;
}

export function isOidcCallbackHandled(url: string): boolean {
  return handledFingerprints.includes(fingerprint(url));
}

export function isOidcCallbackProcessing(url: string): boolean {
  return processingFingerprints.has(fingerprint(url));
}

/**
 * Claim a callback URL for one asynchronous completion attempt. A duplicate
 * intent arriving while the first attempt is in flight is ignored, but a
 * failed attempt can release the claim and be retried later.
 */
export function claimOidcCallback(url: string): boolean {
  const id = fingerprint(url);
  if (handledFingerprints.includes(id) || processingFingerprints.has(id)) {
    return false;
  }
  processingFingerprints.add(id);
  return true;
}

/** Record whether an asynchronous callback attempt completed successfully. */
export function settleOidcCallback(url: string, handled: boolean): void {
  const id = fingerprint(url);
  processingFingerprints.delete(id);
  if (!handled || handledFingerprints.includes(id)) return;

  handledFingerprints.push(id);
  if (handledFingerprints.length > MAX_TRACKED) handledFingerprints.shift();
  if (pendingCallbackUrl === url) pendingCallbackUrl = null;
}

/** Backwards-compatible helper for callers that already completed the callback. */
export function markOidcCallbackHandled(url: string): void {
  settleOidcCallback(url, true);
}
