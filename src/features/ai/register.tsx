import { Sparkles } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";

export const aiFeature: FeatureDef = {
  id: "ai",
  title: "AI Assistant",
  source: "native",
  requires: { plugin: "ai", pluginApiOnly: true },
  settingsLinks: [
    {
      id: "ai",
      label: "AI Assistant",
      icon: Sparkles,
      order: 15,
      href: "/tabs/settings/AiAssistant",
    },
  ],
};
