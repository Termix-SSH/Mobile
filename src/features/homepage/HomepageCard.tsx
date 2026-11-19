import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useClient } from "@/core/accounts";
import type { HomeCardProps } from "@/core/features/types";
import { HomeCard } from "@/screens/home/HomeCard";
import { ListRow, Text } from "@/ui";
import { cachedItems, type HomepageItem } from "./api";
import { widgetType } from "./widgets";

export const PLUGIN_ID = "homepage";
/** The instance key of the plugin's own service links. */
export const LINKS_INSTANCE = "links";

const LINKS_ITEM: HomepageItem = {
  id: -1,
  typeId: "service_links",
  title: "Service links",
  config: {},
};

export function openHomepage(accountId: string) {
  router.push({
    pathname: "/tabs/plugins/[pluginId]",
    params: { pluginId: PLUGIN_ID, view: PLUGIN_ID, account: accountId },
  });
}

/** One Homepage widget, drawn natively when the app knows its type. */
export function HomepageCard({
  accountId,
  active,
  refreshKey,
  instance,
}: HomeCardProps) {
  const client = useClient(accountId);
  const color = useThemeColor();
  const links = instance === LINKS_INSTANCE;
  const [item, setItem] = useState<HomepageItem | null | undefined>(
    links ? LINKS_ITEM : undefined,
  );

  useEffect(() => {
    if (!client || links) return;
    let live = true;
    cachedItems(client, refreshKey > 0)
      .then((items) => {
        if (live) setItem(items.find((i) => String(i.id) === instance) ?? null);
      })
      .catch(() => {
        // Keeps what it showed when the server can't be reached.
      });
    return () => {
      live = false;
    };
  }, [client, instance, links, refreshKey]);

  if (!client || !item) return null;
  const type = widgetType(item.typeId);
  const Widget = type.component;

  return (
    <HomeCard
      title={item.title || type.label}
      icon={type.icon}
      action={Widget ? undefined : "Open"}
      onAction={Widget ? undefined : () => openHomepage(accountId)}
    >
      {Widget ? (
        <Widget
          item={item}
          client={client}
          active={active}
          refreshKey={refreshKey}
        />
      ) : (
        <ListRow
          title="Open in Homepage"
          meta={
            <Text className="text-meta text-muted-foreground">
              This widget only shows on the full page.
            </Text>
          }
          icon={<ExternalLink size={16} color={color("muted-foreground")} />}
          onPress={() => openHomepage(accountId)}
        />
      )}
    </HomeCard>
  );
}
