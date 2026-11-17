import { createElement } from "react";
import * as Lucide from "lucide-react-native";
import { Blocks, type LucideIcon } from "lucide-react-native";

const NOT_ICONS = new Set(["Icon", "LucideProvider", "createLucideIcon"]);

/** The Lucide icon a plugin's manifest names, or a plain block. */
export function pluginIcon(name: string | undefined): LucideIcon {
  if (!name || NOT_ICONS.has(name)) return Blocks;
  return (
    (Lucide as unknown as Record<string, LucideIcon | undefined>)[name] ??
    Blocks
  );
}

export function PluginIcon({
  name,
  size,
  color,
}: {
  name: string | undefined;
  size?: number;
  color?: string;
}) {
  return createElement(pluginIcon(name), { size, color });
}
