import { createElement } from "react";
import { Blocks, icons, type LucideIcon } from "lucide-react-native";

/** The Lucide icon a plugin's manifest names, or a plain block. */
export function pluginIcon(name: string | undefined): LucideIcon {
  if (!name) return Blocks;
  return (icons as Record<string, LucideIcon>)[name] ?? Blocks;
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
