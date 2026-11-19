import { Power, Zap } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import { wakeHostSection } from "./host-section";
import { WakeCard } from "./WakeCard";
import { sendWake } from "./wake";

export { sendWake, wakeRoute } from "./wake";

export const wakeOnLanFeature: FeatureDef = {
  id: "wake-on-lan",
  plugins: ["wake-on-lan"],
  // The Power tab still opens from the server.
  replacesViews: [],
  title: "Wake on LAN",
  source: "native",
  requires: { plugin: "wake-on-lan" },
  availableOn: ["local", "server"],
  hostActions: [
    {
      id: "wake-on-lan.wake",
      label: "Wake on LAN",
      icon: Zap,
      group: "manage",
      order: 10,
      isAvailable: (host) => !!host.macAddress,
      run: async (host, ctx) => {
        ctx.close();
        await sendWake(host, ctx);
      },
    },
  ],
  homeCards: [
    {
      id: "wake-on-lan",
      title: "Wake on LAN",
      icon: Power,
      order: 85,
      component: WakeCard,
    },
  ],
  hostEditorSections: [wakeHostSection],
};
