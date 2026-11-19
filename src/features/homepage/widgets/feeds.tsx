import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { usePoll } from "@/core/exec";
import { ListRow, Text } from "@/ui";
import { ago } from "@/utils/ago";
import { fetchProxy, fetchRss, type RssItem } from "../api";
import {
  bool,
  Empty,
  num,
  openUrl,
  safeUrl,
  str,
  type WidgetProps,
} from "./shared";
import { t } from "@/i18n";

export function RssFeedWidget(props: WidgetProps) {
  const { item, client } = props;
  const feed = str(item.config.feedUrl);
  const max = Math.max(1, num(item.config.maxItems, 5));
  const [items, setItems] = useState<RssItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const url = safeUrl(feed);
    if (!url) return;
    try {
      setItems(await fetchRss(client, url));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [client, feed]);
  usePoll(load, {
    intervalMs: 10 * 60_000,
    enabled: props.active && !!feed,
    restartKey: props.refreshKey,
  });
  if (!feed) return <Empty>{t("homepage.widgets.feeds.noFeedSet")}</Empty>;
  if (failed && !items)
    return <Empty>{t("homepage.widgets.feeds.couldNotLoadTheFeed")}</Empty>;
  if (!items) return null;
  if (items.length === 0)
    return <Empty>{t("homepage.widgets.feeds.theFeedIsEmpty")}</Empty>;
  const describe = bool(item.config.showDescription, false);
  return (
    <View>
      {items.slice(0, max).map((entry, index) => (
        <ListRow
          key={`${entry.link}:${index}`}
          index={index}
          title={entry.title}
          meta={
            <Text className="text-meta text-muted-foreground" numberOfLines={2}>
              {[describe ? entry.description : null, ago(entry.pubDate)]
                .filter(Boolean)
                .join(" | ")}
            </Text>
          }
          onPress={() => openUrl(entry.link)}
        />
      ))}
    </View>
  );
}

interface Wttr {
  nearest_area?: { areaName?: { value: string }[] }[];
  current_condition?: {
    temp_C: string;
    temp_F: string;
    FeelsLikeC: string;
    FeelsLikeF: string;
    weatherDesc?: { value: string }[];
  }[];
  weather?: {
    date: string;
    mintempC: string;
    maxtempC: string;
    mintempF: string;
    maxtempF: string;
  }[];
}

/** Weather from wttr.in, the same source the web widget uses. */
export function WeatherWidget({ item, active, refreshKey }: WidgetProps) {
  const location = str(item.config.location);
  const fahrenheit = str(item.config.unit, "C") === "F";
  const [data, setData] = useState<Wttr | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!location) return;
      try {
        const res = await fetch(
          `https://wttr.in/${encodeURIComponent(location)}?format=j1`,
          { signal },
        );
        if (!res.ok) throw new Error(t("homepage.widgets.feeds.badResponse"));
        setData((await res.json()) as Wttr);
        setFailed(false);
      } catch {
        if (!signal.aborted) setFailed(true);
      }
    },
    [location],
  );
  usePoll(load, {
    intervalMs: 15 * 60_000,
    enabled: active && !!location,
    restartKey: refreshKey,
  });
  if (!location)
    return <Empty>{t("homepage.widgets.feeds.noLocationSet")}</Empty>;
  if (failed && !data)
    return <Empty>{t("homepage.widgets.feeds.couldNotLoadTheWeather")}</Empty>;
  const now = data?.current_condition?.[0];
  if (!now) return null;
  const temp = fahrenheit ? now.temp_F : now.temp_C;
  const feels = fahrenheit ? now.FeelsLikeF : now.FeelsLikeC;
  const unit = fahrenheit ? "F" : "C";
  const place = data?.nearest_area?.[0]?.areaName?.[0]?.value || location;
  return (
    <View className="gap-2 px-3 py-2.5">
      <View className="flex-row items-end gap-3">
        <Text weight="bold" className="text-3xl text-foreground">
          {`${temp}°${unit}`}
        </Text>
        <View className="min-w-0 flex-1 pb-1">
          <Text className="text-[13px] text-foreground" numberOfLines={1}>
            {now.weatherDesc?.[0]?.value ?? ""}
          </Text>
          <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
            {`${place} | feels ${feels}°`}
          </Text>
        </View>
      </View>
      {bool(item.config.showForecast, true) && data?.weather?.length ? (
        <View className="flex-row border-t border-border pt-2">
          {data.weather.slice(0, 3).map((day) => (
            <View key={day.date} className="flex-1 items-center">
              <Text className="text-[10px] uppercase text-muted-foreground">
                {new Date(`${day.date}T12:00:00`).toLocaleDateString(
                  undefined,
                  {
                    weekday: "short",
                  },
                )}
              </Text>
              <Text className="text-[12px] text-foreground">
                {fahrenheit
                  ? `${day.mintempF}° / ${day.maxtempF}°`
                  : `${day.mintempC}° / ${day.maxtempC}°`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A value at a dotted path like "data.items.0.name". */
export function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

const show = (value: unknown) =>
  value == null
    ? "-"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

export function CustomApiWidget({
  item,
  client,
  active,
  refreshKey,
}: WidgetProps) {
  const url = str(item.config.url);
  const every = Math.max(10, num(item.config.refreshInterval, 60));
  const [data, setData] = useState<unknown>(undefined);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const safe = safeUrl(url);
    if (!safe) return;
    try {
      setData(await fetchProxy(client, safe, every));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [client, url, every]);
  usePoll(load, {
    intervalMs: every * 1000,
    enabled: active && !!url,
    restartKey: refreshKey,
  });
  if (!url) return <Empty>{t("homepage.widgets.feeds.noUrlSet")}</Empty>;
  if (failed && data === undefined)
    return <Empty>{t("homepage.widgets.feeds.couldNotLoadTheData")}</Empty>;
  if (data === undefined) return null;

  const mode = str(item.config.displayMode, "value");
  const field = str(item.config.displayField);
  if (mode === "value") {
    const value = field ? resolvePath(data, field) : data;
    return (
      <View className="items-center px-3 py-3">
        <Text
          weight="bold"
          className="text-2xl text-foreground"
          numberOfLines={1}
        >
          {`${show(value)}${str(item.config.unit) ? ` ${str(item.config.unit)}` : ""}`}
        </Text>
        {str(item.config.label) ? (
          <Text className="text-[11px] text-muted-foreground">
            {str(item.config.label)}
          </Text>
        ) : null}
      </View>
    );
  }
  const path = str(item.config.jsonPath);
  const rows = path ? resolvePath(data, path) : data;
  const text =
    mode === "table" && Array.isArray(rows)
      ? rows.slice(0, 8).map(show).join("\n")
      : JSON.stringify(rows, null, 2);
  return (
    <Text
      className="px-3 py-2.5 font-mono text-[11px] text-foreground"
      numberOfLines={12}
    >
      {text}
    </Text>
  );
}

export function ImageWidget({ item }: WidgetProps) {
  const src = safeUrl(str(item.config.imageUrl));
  if (!src) return <Empty>{t("homepage.widgets.feeds.noPictureSet")}</Empty>;
  const link = str(item.config.linkUrl);
  const fit = str(item.config.fit, "cover");
  const image = (
    <Image
      source={{ uri: src }}
      style={{ width: "100%", height: 160 }}
      contentFit={
        fit === "contain" ? "contain" : fit === "fill" ? "fill" : "cover"
      }
      accessibilityLabel={str(item.config.alt) || undefined}
    />
  );
  return link ? (
    <Pressable onPress={() => openUrl(link)} accessibilityRole="link">
      {image}
    </Pressable>
  ) : (
    image
  );
}
