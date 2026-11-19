import { FileText } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import SnippetsBar from "./SnippetsBar";
import { SnippetsCard } from "./SnippetsCard";

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
  homeCards: [
    {
      id: "snippets",
      title: "Snippets",
      icon: FileText,
      order: 70,
      component: SnippetsCard,
    },
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
