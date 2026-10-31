import { router } from "expo-router";
import { ArrowDownUp, QrCode } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import { isSshActive } from "@/utils/hosts";

// Hosts are read and written through the account's repositories, so this
// works on This device and on a server with its own copy.
export const hostTransferFeature: FeatureDef = {
  id: "host-transfer",
  plugins: ["import-export"],
  title: "Import and export",
  source: "native",
  availableOn: ["local", "server"],
  settingsLinks: [
    {
      id: "host-transfer",
      label: "Import and export",
      icon: ArrowDownUp,
      order: 43,
      href: "/tabs/settings/HostTransfer",
      section: "backup",
      description: "Move hosts in or out with a file or QR code",
      keywords: ["import", "export", "qr", "ssh config"],
    },
  ],
  hostActions: [
    {
      id: "share-host",
      label: "Share host",
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
