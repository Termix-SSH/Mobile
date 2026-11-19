import type { AccountClient } from "@/core/api/AccountClient";

const BASE = "/plugin-api/homepage";

export interface HomepageItem {
  id: number;
  typeId: string;
  title: string | null;
  config: Record<string, unknown>;
}

export interface ServiceLink {
  id: number;
  label: string;
  url: string;
  order: number;
}

export interface PingResult {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number;
}

export interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string | null;
}

interface LayoutEntry {
  itemId: number;
  x: number;
  y: number;
}

/** A config the server sent as text; bad JSON becomes an empty object. */
export function parseConfig(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function parseItems(raw: unknown): HomepageItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row): HomepageItem[] => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "number" || typeof r.typeId !== "string") return [];
    return [
      {
        id: r.id,
        typeId: r.typeId,
        title: typeof r.title === "string" ? r.title : null,
        config: parseConfig(r.config),
      },
    ];
  });
}

function layoutEntries(raw: unknown): LayoutEntry[] {
  const entries = (raw as { layout?: { entries?: unknown } } | null)?.layout
    ?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter(
    (e): e is LayoutEntry =>
      !!e &&
      typeof e.itemId === "number" &&
      typeof e.x === "number" &&
      typeof e.y === "number",
  );
}

/**
 * Items in reading order of the saved grid: top to bottom, then left to
 * right. Items the grid doesn't place go last.
 */
export function orderItems(
  items: HomepageItem[],
  layout: unknown,
): HomepageItem[] {
  const place = new Map(layoutEntries(layout).map((e) => [e.itemId, e]));
  const placed = items
    .filter((i) => place.has(i.id))
    .sort((a, b) => {
      const pa = place.get(a.id)!;
      const pb = place.get(b.id)!;
      return pa.y - pb.y || pa.x - pb.x;
    });
  const rest = items.filter((i) => !place.has(i.id));
  return [...placed, ...rest];
}

export async function fetchItems(client: AccountClient) {
  const [items, layout] = await Promise.all([
    client.http.auth.get(`${BASE}/items`),
    client.http.auth.get(`${BASE}/layout`).catch(() => ({ data: null })),
  ]);
  return orderItems(parseItems(items.data), layout.data);
}

export async function fetchServiceLinks(
  client: AccountClient,
): Promise<ServiceLink[]> {
  const { data } = await client.http.auth.get(`${BASE}/service-links`);
  if (!Array.isArray(data)) return [];
  return (data as ServiceLink[])
    .filter((l) => typeof l?.url === "string")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function ping(
  client: AccountClient,
  url: string,
): Promise<PingResult> {
  const { data } = await client.http.auth.get(`${BASE}/ping`, {
    params: { url },
  });
  return data as PingResult;
}

export async function fetchRss(
  client: AccountClient,
  url: string,
): Promise<RssItem[]> {
  const { data } = await client.http.auth.get(`${BASE}/rss`, {
    params: { url },
  });
  return Array.isArray(data) ? (data as RssItem[]) : [];
}

export async function fetchProxy(
  client: AccountClient,
  url: string,
  ttl: number,
): Promise<unknown> {
  const { data } = await client.http.auth.get(`${BASE}/proxy`, {
    params: { url, ttl },
  });
  return data;
}

// The item list, shared by the card list and each card, so a refresh asks once.
const cache = new Map<string, { at: number; items: Promise<HomepageItem[]> }>();
const FRESH_MS = 15_000;

export function cachedItems(
  client: AccountClient,
  force = false,
): Promise<HomepageItem[]> {
  const hit = cache.get(client.accountId);
  if (!force && hit && Date.now() - hit.at < FRESH_MS) return hit.items;
  const items = fetchItems(client);
  cache.set(client.accountId, { at: Date.now(), items });
  items.catch(() => cache.delete(client.accountId));
  return items;
}

/** Test seam. */
export function clearHomepageCache(): void {
  cache.clear();
}
