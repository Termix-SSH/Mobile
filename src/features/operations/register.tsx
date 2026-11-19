import { router } from "expo-router";
import { History, ShieldCheck, Zap } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import { ApprovalsCard } from "./ApprovalsCard";
import { t } from "@/i18n";

/**
 * Actions plugins declare on the server: one list per host, plus approvals
 * and run history. The list comes from the server's catalog, so a new plugin's
 * actions show up here with no app update.
 */
export const operationsFeature: FeatureDef = {
  id: "operations",
  plugins: ["operations-center"],
  title: t("operations.register.actions"),
  source: "native",
  requires: { plugin: "operations-center", pluginApiOnly: true },
  availableOn: ["server"],
  hostActions: [
    {
      id: "operations.host-actions",
      label: t("operations.register.actions"),
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
  homeCards: [
    {
      id: "operations.approvals",
      title: t("operations.register.waitingForApproval"),
      icon: ShieldCheck,
      order: 35,
      component: ApprovalsCard,
    },
  ],
  tools: [
    {
      id: "operations.approvals",
      label: t("operations.register.approvals"),
      description: t("operations.register.actionsWaitingForAPerson"),
      icon: ShieldCheck,
      order: 70,
      href: "/tabs/settings/Approvals",
    },
    {
      id: "operations.history",
      label: t("operations.register.runHistory"),
      description: t("operations.register.everyActionAnyoneRanFrom"),
      icon: History,
      order: 71,
      href: "/tabs/settings/RunHistory",
    },
  ],
};
