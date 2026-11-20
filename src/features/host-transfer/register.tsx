import { router } from "expo-router";
import { ArrowDownUp, QrCode } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import { isSshActive } from "@/utils/hosts";
import { t } from "@/i18n";

// Hosts are read and written through the account's repositories, so this
// works on This device and on a server with its own copy.
export const hostTransferFeature: FeatureDef = {
  id: "host-transfer",
  plugins: ["import-export"],
  title: t("hostTransfer.register.importAndExport"),
  source: "native",
  availableOn: ["local", "server"],
  settingsLinks: [
    {
      id: "host-transfer",
      label: t("hostTransfer.register.importAndExport"),
      icon: ArrowDownUp,
      order: 43,
      href: "/tabs/settings/HostTransfer",
      section: "backup",
      description: t("hostTransfer.register.moveHostsInOrOut"),
      keywords: ["import", "export", "qr", "ssh config"],
    },
  ],
  hostActions: [
    {
      id: "share-host",
      label: t("hostTransfer.register.shareHost"),
      icon: QrCode,
      group: "manage",
      order: 60,
      isAvailable: (host) => isSshActive(host) && !host.shared,
      run: (host, ctx) => {
        ctx.close();
        router.push({
          pathname: "/tabs/settings/HostShare" as never,
          params: { id: String(host.id) },
        });
      },
    },
  ],
};
