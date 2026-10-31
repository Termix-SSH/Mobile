import { SlidersHorizontal } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";

// The screen needs the encrypted copy, so a live server (no sync) has none.
export const hostDefaultsFeature: FeatureDef = {
  id: "host-defaults",
  title: "Host defaults",
  source: "native",
  availableOn: ["local", "server"],
  settingsLinks: [
    {
      id: "host-defaults",
      label: "Host defaults",
      icon: SlidersHorizontal,
      order: 42,
      href: "/tabs/settings/HostDefaults",
      section: "accounts",
      description: "Port, user and options for new hosts",
      keywords: ["new host", "port", "default"],
    },
  ],
};
