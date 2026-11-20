/**
 * Other plugins' parts inside a plugin web view, the app's side. The page
 * draws a placeholder and reports where it is; the app draws the other
 * plugin's part in a web view of its own over that spot, clipped to the
 * page. Same rules as the web app's shell (core frames/foreign-policy.ts).
 */

import type { ServerPlugin } from "@/core/api/compat/server-features";

export type ForeignKind = "slot" | "extension" | "component";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAX_LISTS = 100;
export const MAX_VIEWS = 100;
const MAX_ID = 40;
const MAX_COORD = 100_000;

export function isForeignKind(value: unknown): value is ForeignKind {
  return value === "slot" || value === "extension" || value === "component";
}

export function validId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= MAX_ID
  );
}

function usesOf(plugin: Pick<ServerPlugin, "frame"> | undefined): string[] {
  const uses = (plugin?.frame?.contributes as { uses?: unknown } | undefined)
    ?.uses;
  return Array.isArray(uses)
    ? uses.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * A page may place parts of an id under its own plugin id, or one its
 * manifest lists in `contributes.uses`.
 */
export function mayPlaceForeign(
  consumerId: string,
  consumer: Pick<ServerPlugin, "frame"> | undefined,
  kind: unknown,
  id: unknown,
): boolean {
  if (!isForeignKind(kind) || typeof id !== "string") return false;
  if (!id || id.length > 200) return false;
  if (usesOf(consumer).includes(id)) return true;
  return id.startsWith(`${consumerId}.`);
}

/**
 * Plugins that may have parts for `id`: they list it in `uses`, or the id
 * is under their own plugin id. The consumer reads its own parts itself.
 */
export function providersFor(
  plugins: ServerPlugin[],
  consumerId: string,
  id: string,
): ServerPlugin[] {
  return plugins.filter(
    (plugin) =>
      plugin.id !== consumerId &&
      plugin.active &&
      !!plugin.frame &&
      (usesOf(plugin).includes(id) || id.startsWith(`${plugin.id}.`)),
  );
}

const SEP = "\u0001";

/** A part key the app can trace back to its plugin. */
export function partKey(pluginId: string, itemKey: string): string {
  return `${pluginId}${SEP}${itemKey}`;
}

export function splitPartKey(
  key: string,
): { pluginId: string; itemKey: string } | null {
  const at = key.indexOf(SEP);
  if (at <= 0) return null;
  return { pluginId: key.slice(0, at), itemKey: key.slice(at + 1) };
}

function rekey(value: unknown, pluginId: string): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => rekey(item, pluginId));
  const record = value as Record<string, unknown>;
  if (typeof record.$foreign === "string" && Object.keys(record).length === 1) {
    return { $foreign: partKey(pluginId, record.$foreign) };
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    out[key] = rekey(item, pluginId);
  }
  return out;
}

/**
 * Every provider's parts in one list, each component marker keyed by its
 * plugin. Slot items sort by order like the shell does.
 */
export function mergeParts(
  kind: ForeignKind,
  described: { pluginId: string; items: unknown[] }[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const { pluginId, items } of described) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      out.push({
        ...(rekey(item, pluginId) as Record<string, unknown>),
        pluginId,
      });
    }
  }
  if (kind === "slot") {
    out.sort(
      (a, b) =>
        (Number(a.order) || 0) - (Number(b.order) || 0) ||
        String(a.actionId).localeCompare(String(b.actionId)),
    );
  }
  if (kind === "component") return out.slice(0, 1);
  return out;
}

/** The marker keys in a list, to check a mount against. */
export function partKeys(items: unknown[]): Set<string> {
  const keys = new Set<string>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(walk);
    const record = value as Record<string, unknown>;
    if (typeof record.$foreign === "string") keys.add(record.$foreign);
    for (const item of Object.values(record)) walk(item);
  };
  items.forEach(walk);
  return keys;
}

export function readRect(value: unknown): Rect | null {
  if (!value || typeof value !== "object") return null;
  const { x, y, width, height } = value as Record<string, unknown>;
  if (
    ![x, y, width, height].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    )
  ) {
    return null;
  }
  const clamp = (n: number) => Math.max(-MAX_COORD, Math.min(MAX_COORD, n));
  return {
    x: clamp(x as number),
    y: clamp(y as number),
    width: Math.max(0, clamp(width as number)),
    height: Math.max(0, clamp(height as number)),
  };
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return { x, y, width: 0, height: 0 };
  return { x, y, width: right - x, height: bottom - y };
}

const empty = (rect: Rect) => !(rect.width > 0 && rect.height > 0);

export interface PartPlacement {
  rect: Rect;
  clip: Rect | null;
  visible: boolean;
  covers: Rect[];
}

/**
 * Where a part goes in the page's box (web view coords, which match the
 * page's), what shows of it and whether it hides.
 */
export function placePart(
  page: { width: number; height: number },
  placement: PartPlacement,
): {
  hidden: boolean;
  /** The part's own box. */
  rect: Rect;
  /** What shows of it, in the page's coords. */
  shown: Rect;
} {
  const bounds = { x: 0, y: 0, width: page.width, height: page.height };
  let shown = intersect(placement.rect, bounds);
  if (placement.clip) shown = intersect(shown, placement.clip);
  const covered = placement.covers.some(
    (cover) => !empty(intersect(cover, shown)),
  );
  return {
    hidden: !placement.visible || empty(shown) || covered,
    rect: placement.rect,
    shown,
  };
}
