/**
 * Wake-on-LAN from the phone: a magic packet over UDP broadcast on the
 * network the phone is on.
 */
import * as Network from "expo-network";
import { isLanAvailable, udpSend } from "@/modules/termix-net";

const PORT = 9;
const LIMITED = "255.255.255.255";

/** The six bytes of a MAC address, or null when it isn't one. */
export function parseMac(input: string | undefined | null): number[] | null {
  const hex = (input ?? "").trim().replace(/[:\-.\s]/g, "");
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) return null;
  return hex.match(/../g)!.map((b) => parseInt(b, 16));
}

/** Six 0xFF bytes, then the MAC sixteen times. */
export function magicPacket(mac: number[]): number[] {
  const packet = new Array<number>(6).fill(0xff);
  for (let i = 0; i < 16; i++) packet.push(...mac);
  return packet;
}

export function toBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function octets(ip: string): number[] | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

/**
 * The subnet broadcast address for the phone's IP. Without a mask a private
 * address is taken as a /24, which is what home networks use.
 */
export function broadcastFor(ip: string | null, mask?: string): string | null {
  const addr = ip ? octets(ip) : null;
  if (!addr) return null;
  const m = mask ? octets(mask) : null;
  if (m) return addr.map((o, i) => (o | (~m[i] & 255)) & 255).join(".");
  const [a, b] = addr;
  const private24 =
    a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  return private24 ? `${a}.${b}.${addr[2]}.255` : null;
}

/** A host's own broadcast address, as the Wake-on-LAN plugin keeps it. */
export function hostBroadcast(host: {
  pluginSettings?: Record<string, Record<string, unknown>>;
}): string | null {
  const value = host.pluginSettings?.["wake-on-lan"]?.broadcastAddress;
  return typeof value === "string" && octets(value) ? value.trim() : null;
}

export class WakeError extends Error {}

export interface WakeHost {
  macAddress?: string;
  pluginSettings?: Record<string, Record<string, unknown>>;
}

/** Sends the magic packet from the phone. Throws a WakeError with a plain message. */
export async function wakeFromDevice(host: WakeHost): Promise<void> {
  const mac = parseMac(host.macAddress);
  if (!mac) throw new WakeError("This host has no valid MAC address.");
  if (!isLanAvailable()) {
    throw new WakeError("This build can't send Wake-on-LAN packets.");
  }
  const ip = await Network.getIpAddressAsync().catch(() => null);
  const targets = new Set<string>();
  const own = hostBroadcast(host);
  if (own) targets.add(own);
  else {
    const subnet = broadcastFor(ip);
    if (subnet) targets.add(subnet);
  }
  targets.add(LIMITED);

  const payload = toBase64(magicPacket(mac));
  let sent = 0;
  let last: unknown;
  for (const target of targets) {
    try {
      await udpSend(target, PORT, payload);
      sent++;
    } catch (e) {
      last = e;
    }
  }
  if (!sent) {
    throw new WakeError(
      last instanceof Error && last.message
        ? last.message
        : "Could not send the packet. Check that Wi-Fi is on.",
    );
  }
}
