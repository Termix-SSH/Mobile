import { LayoutGrid } from "lucide-react-native";
import type { FeatureContext, FeatureDef } from "@/core/features/types";
import { cachedItems } from "./api";
import { HomepageCard, LINKS_INSTANCE, PLUGIN_ID } from "./HomepageCard";
import { SKIPPED_TYPES, widgetType } from "./widgets";
import { t } from "@/i18n";

/** One Home card per Homepage widget, then the plugin's service links. */
export async function homepageInstances(ctx: FeatureContext) {
  if (!ctx.client) return [];
  const items = await cachedItems(ctx.client);
  return [
    ...items
      .filter((item) => !SKIPPED_TYPES.has(item.typeId))
      .map((item) => ({
        key: String(item.id),
        title: item.title || widgetType(item.typeId).label,
      })),
    // Off at first: Homepage grids usually show the same links.
    {
      key: LINKS_INSTANCE,
      title: t("homepage.register.serviceLinks"),
      defaultOn: false,
    },
  ];
}

export const homepageFeature: FeatureDef = {
  id: "homepage",
  plugins: [PLUGIN_ID],
  // The full page still opens as a web view.
  replacesViews: [],
  title: t("homepage.register.homepage"),
  source: "native",
  requires: { plugin: PLUGIN_ID, pluginApiOnly: true },
  availableOn: ["server"],
  homeCards: [
    {
      id: "homepage",
      title: t("homepage.register.homepage"),
      icon: LayoutGrid,
      order: 60,
      instances: homepageInstances,
      component: HomepageCard,
    },
  ],
};
