import { router } from "expo-router";
import { History, ShieldCheck, Zap } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";

/**
 * Actions plugins declare on the server: one list per host, plus approvals
 * and run history. The list comes from the server's catalog, so a new plugin's
 * actions show up here with no app update.
 */
export const operationsFeature: FeatureDef = {
  id: "operations",
  plugins: ["operations-center"],
  title: "Actions",
  source: "native",
  requires: { plugin: "operations-center", pluginApiOnly: true },
  availableOn: ["server"],
  hostActions: [
    {
      id: "operations.host-actions",
      label: "Actions",
      icon: Zap,
      group: "manage",
      order: 5,
      isAvailable: () => true,
      run: (host, ctx) => {
        ctx.close();
        router.push({
          pathname: "/tabs/settings/HostActions" as never,
          params: { id: String(host.id) },
        });
      },
    },
  ],
  tools: [
    {
      id: "operations.approvals",
      label: "Approvals",
      description: "Actions waiting for a person to say yes",
      icon: ShieldCheck,
      order: 70,
      href: "/tabs/settings/Approvals",
    },
    {
      id: "operations.history",
      label: "Run history",
      description: "Every action anyone ran, from any device",
      icon: History,
      order: 71,
      href: "/tabs/settings/RunHistory",
    },
  ],
};
