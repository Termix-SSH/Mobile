import { FileText } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import SnippetsBar from "./SnippetsBar";

export const snippetsFeature: FeatureDef = {
  id: "snippets",
  plugins: ["snippets"],
  title: "Snippets",
  source: "native",
  requires: { plugin: "snippets" },
  // Snippets live in the local store too, so This device has them.
  availableOn: ["local", "server"],
  keyboardTabs: [
    { id: "snippets", label: "SNIPPETS", order: 10, component: SnippetsBar },
  ],
  tools: [
    {
      id: "snippets",
      label: "Snippets",
      description: "Saved commands to run on any host",
      icon: FileText,
      order: 20,
      href: "/tabs/settings/Snippets",
    },
  ],
  capabilities: ["widgets.snippets"],
};
