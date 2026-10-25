/** Link targets looked up at once while listing a folder. */
export const LINK_LOOKUPS = 6;

/** Joins remote path parts with single slashes. */
export function joinRemote(dir: string, name: string): string {
  if (!dir || dir === "/") return `/${name.replace(/^\/+/, "")}`;
  return `${dir.replace(/\/+$/, "")}/${name.replace(/^\/+/, "")}`;
}

export function remoteParent(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  return i <= 0 ? "/" : trimmed.slice(0, i);
}

export function remoteName(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || "/";
}

/** Quotes a value for a POSIX shell. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** A name in `dir` that is not taken, like the web's `<name>_copy_<time>`. */
export function copyName(name: string, now = Date.now()): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name}_copy_${now}`;
  return `${name.slice(0, dot)}_copy_${now}${name.slice(dot)}`;
}

/** A file:// uri or a plain path, as a plain path for the SSH engine. */
export function toLocalPath(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  return decodeURIComponent(uri.slice("file://".length));
}

/** Breadcrumb parts of an absolute path, from the root. */
export function crumbs(path: string): { name: string; path: string }[] {
  const out = [{ name: "/", path: "/" }];
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    current += `/${part}`;
    out.push({ name: part, path: current });
  }
  return out;
}
