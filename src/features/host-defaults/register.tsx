import { SlidersHorizontal } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import { t } from "@/i18n";

// The screen needs the encrypted copy, so a live server (no sync) has none.
export const hostDefaultsFeature: FeatureDef = {
  id: "host-defaults",
  title: t("hostDefaults.register.hostDefaults"),
  source: "native",
  availableOn: ["local", "server"],
  settingsLinks: [
    {
      id: "host-defaults",
      label: t("hostDefaults.register.hostDefaults"),
      icon: SlidersHorizontal,
      order: 42,
      href: "/tabs/settings/HostDefaults",
      section: "accounts",
      description: t("hostDefaults.register.portUserAndOptionsFor"),
      keywords: ["new host", "port", "default"],
    },
  ],
};
