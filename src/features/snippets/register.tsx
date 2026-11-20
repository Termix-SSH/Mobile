import { FileText } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import SnippetsBar from "./SnippetsBar";
import { SnippetsCard } from "./SnippetsCard";
import { t } from "@/i18n";

export const snippetsFeature: FeatureDef = {
  id: "snippets",
  plugins: ["snippets"],
  title: t("snippets.register.snippets"),
  source: "native",
  requires: { plugin: "snippets" },
  // Snippets live in the local store too, so This device has them.
  availableOn: ["local", "server"],
  keyboardTabs: [
    {
      id: "snippets",
      label: t("snippets.register.snippets2"),
      order: 10,
      component: SnippetsBar,
    },
  ],
  homeCards: [
    {
      id: "snippets",
      title: t("snippets.register.snippets"),
      icon: FileText,
      order: 70,
      component: SnippetsCard,
    },
  ],
  tools: [
    {
      id: "snippets",
      label: t("snippets.register.snippets"),
      description: t("snippets.register.savedCommandsToRunOn"),
      icon: FileText,
      order: 20,
      href: "/tabs/settings/Snippets",
    },
  ],
  capabilities: ["widgets.snippets"],
};
