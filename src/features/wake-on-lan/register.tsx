import { Zap } from "lucide-react-native";
import type { FeatureContext, FeatureDef } from "@/core/features/types";
import { toast } from "@/utils/toast";
import { serverHostId } from "@/core/sync";
import { originOf } from "@/core/transport";
import { wakeFromDevice } from "@/core/wol";
import type { SSHHost } from "@/types";
import { wakeHostSection } from "./host-section";

/** Where the packet starts: the phone on This device, else the host's origin. */
export async function wakeRoute(
  host: SSHHost,
  ctx: FeatureContext,
): Promise<"device" | "server" | "either"> {
  if (!ctx.client) return "device";
  const origin = await originOf(ctx.account.id, host).catch(() => "auto");
  if (origin === "device") return "device";
  if (origin === "server") return "server";
  return "either";
}

async function wakeViaServer(host: SSHHost, ctx: FeatureContext) {
  const client = ctx.client;
  if (!client) throw new Error("No server");
  await client.api.wakeOnLan.wakeHost(
    await serverHostId(client.accountId, host),
  );
}

export const wakeOnLanFeature: FeatureDef = {
  id: "wake-on-lan",
  plugins: ["wake-on-lan"],
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
        try {
          const route = await wakeRoute(host, ctx);
          if (route === "device") {
            await wakeFromDevice(host);
          } else if (route === "server") {
            await wakeViaServer(host, ctx);
          } else {
            try {
              await wakeViaServer(host, ctx);
            } catch {
              await wakeFromDevice(host);
            }
          }
          toast.success(`Wake-on-LAN sent to ${host.name}`);
        } catch (e) {
          toast.error(
            e instanceof Error && e.message
              ? e.message
              : "Failed to send Wake-on-LAN packet",
          );
        }
      },
    },
  ],
  hostEditorSections: [wakeHostSection],
};
