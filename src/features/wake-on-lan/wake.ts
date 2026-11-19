import type { FeatureContext } from "@/core/features/types";
import { toast } from "@/utils/toast";
import { serverHostId } from "@/core/sync";
import { originOf } from "@/core/transport";
import { wakeFromDevice } from "@/core/wol";
import type { SSHHost } from "@/types";

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

/** Sends the packet the best way for this host and says how it went. */
export async function sendWake(
  host: SSHHost,
  ctx: FeatureContext,
): Promise<boolean> {
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
    return true;
  } catch (e) {
    toast.error(
      e instanceof Error && e.message
        ? e.message
        : "Failed to send Wake-on-LAN packet",
    );
    return false;
  }
}
