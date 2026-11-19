import { useCallback, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { ExternalLink, Search } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { usePoll } from "@/core/exec";
import { ListRow, Text } from "@/ui";
import { fetchServiceLinks, type ServiceLink } from "../api";
import {
  bool,
  Empty,
  list,
  num,
  openUrl,
  PingDot,
  ServiceIcon,
  str,
  usePings,
  type WidgetProps,
} from "./shared";

interface Tile {
  label: string;
  url: string;
  imageUrl?: string;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Icon tiles with an up or down dot, a few to a row. */
export function TileGrid({
  tiles,
  columns,
  showLabels = true,
  props,
}: {
  tiles: Tile[];
  columns: number;
  showLabels?: boolean;
  props: WidgetProps;
}) {
  const pings = usePings(
    props.client,
    tiles.map((t) => t.url),
    props,
  );
  if (tiles.length === 0) return <Empty>No services yet.</Empty>;
  // Phones fit four at most.
  const cols = Math.min(Math.max(columns, 2), 4);
  const width = `${100 / cols}%` as const;
  return (
    <View className="flex-row flex-wrap">
      {tiles.map((tile, index) => (
        <Pressable
          key={`${tile.url}:${index}`}
          onPress={() => openUrl(tile.url)}
          accessibilityRole="link"
          accessibilityLabel={tile.label}
          style={{ width }}
          className="items-center gap-1.5 px-1 py-3 active:bg-muted/40"
        >
          <View>
            <ServiceIcon label={tile.label} imageUrl={tile.imageUrl} />
            <View className="absolute -right-1 -top-1">
              <PingDot result={pings[tile.url]} />
            </View>
          </View>
          {showLabels ? (
            <Text
              className="text-center text-[11px] text-foreground"
              numberOfLines={1}
            >
              {tile.label}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

export function ServiceGridWidget(props: WidgetProps) {
  const { config } = props.item;
  const tiles = list<Tile>(config.services).filter(
    (s) => typeof s.url === "string",
  );
  return (
    <TileGrid
      tiles={tiles.map((s) => ({
        label: str(s.label, hostOf(s.url)),
        url: s.url,
        imageUrl: str(s.imageUrl) || undefined,
      }))}
      columns={num(config.columns, 4)}
      showLabels={bool(config.showLabels, true)}
      props={props}
    />
  );
}

export function ServiceLinkWidget(props: WidgetProps) {
  const { item } = props;
  const url = str(item.config.url);
  const pings = usePings(props.client, url ? [url] : [], props);
  if (!url) return <Empty>No link set.</Empty>;
  const label = item.title || hostOf(url);
  return (
    <ListRow
      title={label}
      icon={
        bool(item.config.showImage, true) ? (
          <ServiceIcon
            label={label}
            imageUrl={str(item.config.imageUrl) || undefined}
            size={20}
          />
        ) : undefined
      }
      meta={
        <Text className="text-meta text-muted-foreground" numberOfLines={1}>
          {str(item.config.description) || hostOf(url)}
        </Text>
      }
      trailing={<PingDot result={pings[url]} />}
      onPress={() => openUrl(url)}
    />
  );
}

function LinkRows({
  links,
}: {
  links: { label: string; url: string; description?: string }[];
}) {
  const color = useThemeColor();
  if (links.length === 0) return <Empty>No links yet.</Empty>;
  return (
    <View>
      {links.map((link, index) => (
        <ListRow
          key={`${link.url}:${index}`}
          index={index}
          title={link.label || hostOf(link.url)}
          meta={
            <Text className="text-meta text-muted-foreground" numberOfLines={1}>
              {link.description || hostOf(link.url)}
            </Text>
          }
          trailing={
            <ExternalLink size={14} color={color("muted-foreground")} />
          }
          onPress={() => openUrl(link.url)}
        />
      ))}
    </View>
  );
}

const asLinks = (v: unknown) =>
  list<{ label?: unknown; url?: unknown; description?: unknown }>(v)
    .filter((l) => typeof l.url === "string")
    .map((l) => ({
      label: str(l.label),
      url: str(l.url),
      description: str(l.description) || undefined,
    }));

export function BookmarkListWidget({ item }: WidgetProps) {
  return <LinkRows links={asLinks(item.config.links)} />;
}

export function LinkTreeWidget({ item }: WidgetProps) {
  const sections = list<{ heading?: unknown; links?: unknown }>(
    item.config.sections,
  );
  if (sections.length === 0) return <Empty>No links yet.</Empty>;
  return (
    <View>
      {sections.map((section, index) => (
        <View key={index}>
          {str(section.heading) ? (
            <Text className="px-3 pb-1 pt-2.5 text-[10px] uppercase tracking-[1px] text-muted-foreground">
              {str(section.heading)}
            </Text>
          ) : null}
          <LinkRows links={asLinks(section.links)} />
        </View>
      ))}
    </View>
  );
}

/** The plugin's own service links, the ones the desktop dashboard shows. */
export function ServiceLinksWidget(props: WidgetProps) {
  const [links, setLinks] = useState<ServiceLink[] | null>(null);
  const load = useCallback(async () => {
    setLinks(await fetchServiceLinks(props.client).catch(() => []));
  }, [props.client]);
  usePoll(load, {
    intervalMs: 5 * 60_000,
    enabled: props.active,
    restartKey: props.refreshKey,
  });
  if (!links) return null;
  const max = num(props.item.config.maxItems, 0);
  const shown = max > 0 ? links.slice(0, max) : links;
  return (
    <TileGrid
      tiles={shown.map((l) => ({
        label: l.label || hostOf(l.url),
        url: l.url,
      }))}
      columns={4}
      props={props}
    />
  );
}

const ENGINES: Record<string, string> = {
  google: "https://www.google.com/search?q={q}",
  duckduckgo: "https://duckduckgo.com/?q={q}",
  bing: "https://www.bing.com/search?q={q}",
};

function SearchBox({
  placeholder,
  onSubmit,
}: {
  placeholder: string;
  onSubmit: (query: string) => void;
}) {
  const color = useThemeColor();
  const [query, setQuery] = useState("");
  const submit = () => {
    if (!query.trim()) return;
    onSubmit(query.trim());
    setQuery("");
  };
  return (
    <View className="flex-row items-center gap-2 border border-border bg-background px-2.5">
      <Search size={14} color={color("muted-foreground")} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor={color("muted-foreground")}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        style={{ flex: 1, color: color("foreground"), paddingVertical: 8 }}
      />
    </View>
  );
}

export function SearchBarWidget({ item }: WidgetProps) {
  const engine = str(item.config.engine, "google");
  const template =
    engine === "custom" ? str(item.config.customUrl) : ENGINES[engine];
  if (!template) return <Empty>No search engine set.</Empty>;
  return (
    <View className="px-3 py-2.5">
      <SearchBox
        placeholder={str(item.config.placeholder) || "Search"}
        onSubmit={(q) =>
          openUrl(template.replace("{q}", encodeURIComponent(q)))
        }
      />
    </View>
  );
}

export function SearchLinksWidget({ item }: WidgetProps) {
  const shortcuts = list<{ label?: unknown; queryTemplate?: unknown }>(
    item.config.shortcuts,
  ).filter((s) => typeof s.queryTemplate === "string");
  const [picked, setPicked] = useState(0);
  if (shortcuts.length === 0) return <Empty>No shortcuts yet.</Empty>;
  const current = shortcuts[Math.min(picked, shortcuts.length - 1)];
  return (
    <View className="gap-2 px-3 py-2.5">
      <View className="flex-row flex-wrap gap-1.5">
        {shortcuts.map((s, index) => (
          <Pressable
            key={index}
            onPress={() => setPicked(index)}
            accessibilityRole="button"
            accessibilityState={{ selected: index === picked }}
            className={`border px-2 py-1 ${index === picked ? "border-accent-brand bg-accent-brand/10" : "border-border"}`}
          >
            <Text className="text-[11px] text-foreground">
              {str(s.label, "Search")}
            </Text>
          </Pressable>
        ))}
      </View>
      <SearchBox
        placeholder={`Search ${str(current.label)}`.trim()}
        onSubmit={(q) =>
          openUrl(
            str(current.queryTemplate).replace("{q}", encodeURIComponent(q)),
          )
        }
      />
    </View>
  );
}
