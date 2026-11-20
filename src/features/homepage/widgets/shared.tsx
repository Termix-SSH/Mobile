import { useCallback, useState } from "react";
import { Linking, View } from "react-native";
import { Image } from "expo-image";
import type { AccountClient } from "@/core/api/AccountClient";
import { usePoll } from "@/core/exec";
import { Text } from "@/ui";
import { toast } from "@/utils/toast";
import { ping, type HomepageItem, type PingResult } from "../api";
import { t } from "@/i18n";

export interface WidgetProps {
  item: HomepageItem;
  client: AccountClient;
  active: boolean;
  refreshKey: number;
}

export const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
export const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
export const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === "boolean" ? v : fallback;
export function list<T = Record<string, unknown>>(v: unknown): T[] {
  return Array.isArray(v)
    ? (v.filter((x) => x && typeof x === "object") as T[])
    : [];
}

/** Adds http:// to a bare host, like the web widgets do. Null when unsafe. */
export function safeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? withScheme
      : null;
  } catch {
    return null;
  }
}

export function openUrl(raw: string): void {
  const url = safeUrl(raw);
  if (!url) return;
  Linking.openURL(url).catch(() =>
    toast.error(t("homepage.widgets.shared.couldNotOpenTheLink")),
  );
}

/** A service picture, or its first letter when there is none. */
export function ServiceIcon({
  label,
  imageUrl,
  size = 28,
}: {
  label: string;
  imageUrl?: string;
  size?: number;
}) {
  const src = imageUrl ? safeUrl(imageUrl) : null;
  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size }}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center bg-muted"
    >
      <Text weight="bold" className="text-xs text-muted-foreground">
        {(label.trim()[0] ?? "?").toUpperCase()}
      </Text>
    </View>
  );
}

const PING_MS = 60_000;

/** Up or down for each URL, through the plugin so the server does the check. */
export function usePings(
  client: AccountClient,
  urls: string[],
  { active, refreshKey }: { active: boolean; refreshKey: number },
): Record<string, PingResult | null> {
  const [results, setResults] = useState<Record<string, PingResult | null>>({});
  const key = urls.join("\n");
  const run = useCallback(async () => {
    const out: Record<string, PingResult | null> = {};
    await Promise.all(
      urls.map(async (url) => {
        const safe = safeUrl(url);
        if (!safe) return;
        out[url] = await ping(client, safe).catch(() => null);
      }),
    );
    setResults(out);
    // urls is read through key so a new array with the same URLs doesn't rerun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);
  usePoll(run, {
    intervalMs: PING_MS,
    enabled: active && urls.length > 0,
    restartKey: `${refreshKey}:${key}`,
  });
  return results;
}

/** Green, red, or gray while it hasn't answered. */
export function PingDot({ result }: { result: PingResult | null | undefined }) {
  const cls =
    result == null
      ? "bg-muted-foreground/40"
      : result.ok
        ? "bg-success"
        : "bg-destructive";
  return <View className={`h-2 w-2 rounded-full ${cls}`} />;
}

export function Empty({ children }: { children: string }) {
  return (
    <Text className="px-3 py-2.5 text-[11px] text-muted-foreground">
      {children}
    </Text>
  );
}
