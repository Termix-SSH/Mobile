import { router } from "expo-router";
import { Users } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import { t } from "@/i18n";

/** Share a server host with people and roles, like the web app's Share. */
export const hostAccessFeature: FeatureDef = {
  id: "host-access",
  title: t("hostAccess.title"),
  source: "native",
  availableOn: ["server"],
  hostActions: [
    {
      id: "host-access",
      label: t("hostAccess.action"),
      icon: Users,
      group: "manage",
      order: 55,
      // Owners, and people the host was shared with at manage level.
      isAvailable: (host) =>
        !host.shared || host.shared.permissionLevel === "manage",
      run: (host, ctx) => {
        ctx.close();
        router.push({
          pathname: "/tabs/settings/HostAccess" as never,
          params: { id: String(host.id) },
        });
      },
    },
  ],
};
