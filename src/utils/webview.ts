// Helpers for web views that show a page the app builds itself.

// "<" could close the script tag, and U+2028 and U+2029 end a line in older
// engines.
const BACKSLASH = String.fromCharCode(92);
const ESCAPED = [0x3c, 0x2028, 0x2029];

/** JSON that is safe inside a script tag. */
export function inlineJson(value: unknown): string {
  let json = JSON.stringify(value);
  for (const code of ESCAPED) {
    const hex = code.toString(16).padStart(4, "0");
    json = json.split(String.fromCharCode(code)).join(`${BACKSLASH}u${hex}`);
  }
  return json;
}

/** Origins an app built page loads from. */
export const LOCAL_PAGE_ORIGINS = ["about:*", "data:*", "blob:*"];

/**
 * Keeps an app built page where it is: a link or script can't send the web
 * view, and the bridge into the app, to another site.
 */
export function stayOnLocalPage(request: { url: string }): boolean {
  const url = request.url;
  return (
    url.startsWith("about:") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  );
}
