import type { SettingsLinkDef } from "@/core/features";
import { SETTINGS_ITEMS } from "./items";
import { SETTINGS_SECTIONS } from "./sections";
import type { SettingsEnv, SettingsGroup, SettingsItemDef } from "./types";

/** A feature's settings link as a settings item. */
export function linkToItem(link: SettingsLinkDef): SettingsItemDef {
  return {
    id: `link:${link.id}`,
    section: link.section ?? "accounts",
    label: link.label,
    description: link.description,
    keywords: link.keywords,
    // Feature links go after the app's own rows of the same section.
    order: 1000 + link.order,
    icon: link.icon,
    href: link.href,
  };
}

/**
 * Everything Settings shows for this phone and account, grouped by section.
 * Sections with nothing in them are left out.
 */
export function buildSettingsGroups(
  env: SettingsEnv,
  links: SettingsLinkDef[],
  base: SettingsItemDef[] = SETTINGS_ITEMS,
): SettingsGroup[] {
  const items = [...base, ...links.map(linkToItem)].filter(
    (item) => !item.when || item.when(env),
  );
  return [...SETTINGS_SECTIONS]
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      section,
      items: items
        .filter((item) => item.section === section.id)
        .sort((a, b) => a.order - b.order),
    }))
    .filter((group) => group.items.length > 0);
}
