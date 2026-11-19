import { LayoutGrid } from "lucide-react-native";
import type { FeatureContext, FeatureDef } from "@/core/features/types";
import { cachedItems } from "./api";
import { HomepageCard, LINKS_INSTANCE, PLUGIN_ID } from "./HomepageCard";
import { SKIPPED_TYPES, widgetType } from "./widgets";

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
    { key: LINKS_INSTANCE, title: "Service links", defaultOn: false },
  ];
}

export const homepageFeature: FeatureDef = {
  id: "homepage",
  plugins: [PLUGIN_ID],
  // The full page still opens as a web view.
  replacesViews: [],
  title: "Homepage",
  source: "native",
  requires: { plugin: PLUGIN_ID, pluginApiOnly: true },
  availableOn: ["server"],
  homeCards: [
    {
      id: "homepage",
      title: "Homepage",
      icon: LayoutGrid,
      order: 60,
      instances: homepageInstances,
      component: HomepageCard,
    },
  ],
};
