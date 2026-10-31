/** Whether a page is on the same scheme, host and port as the server. */
export function sameOrigin(
  pageUrl: string | undefined | null,
  serverUrl: string | undefined | null,
): boolean {
  if (!pageUrl || !serverUrl) return false;
  try {
    return new URL(pageUrl).origin === new URL(serverUrl).origin;
  } catch {
    return false;
  }
}
