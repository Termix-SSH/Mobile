import type { FeatureDef } from "@/core/features/types";
import { t } from "@/i18n";

export const tailscaleFeature: FeatureDef = {
  id: "tailscale",
  plugins: ["tailscale"],
  title: t("tailscale.register.tailscale"),
  source: "native",
  requires: { plugin: "tailscale", pluginApiOnly: true },
  capabilities: ["hosts.discovery"],
};
