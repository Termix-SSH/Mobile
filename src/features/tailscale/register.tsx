import type { FeatureDef } from "@/core/features/types";

export const tailscaleFeature: FeatureDef = {
  id: "tailscale",
  plugins: ["tailscale"],
  title: "Tailscale",
  source: "native",
  requires: { plugin: "tailscale", pluginApiOnly: true },
  capabilities: ["hosts.discovery"],
};
