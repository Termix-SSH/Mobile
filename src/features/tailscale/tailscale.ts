export interface TailscaleDevice {
  id: string;
  name: string;
  hostname: string;
  addresses: string[];
  os: string;
  lastSeen: string;
}

export interface TailscaleDevicesResult {
  devices: TailscaleDevice[];
  hasApiKey: boolean;
  error?: string;
}

/** Prefer the device's Tailscale IPv4 address when both families are listed. */
export function tailnetAddress(device: TailscaleDevice): string {
  return (
    device.addresses.find((address) => address.startsWith("100.")) ??
    device.addresses[0] ??
    ""
  );
}

export function filterTailscaleDevices(
  devices: TailscaleDevice[],
  query: string,
): TailscaleDevice[] {
  const search = query.trim().toLowerCase();
  if (!search) return devices;
  return devices.filter((device) =>
    [device.hostname, device.name, device.os, ...device.addresses].some(
      (value) => value.toLowerCase().includes(search),
    ),
  );
}

/** Host creation needs no API key, password, or private key for Tailscale SSH. */
export function tailscaleHostDraft(device: TailscaleDevice, username: string) {
  return {
    name: device.hostname || device.name,
    ip: tailnetAddress(device),
    port: 22 as const,
    username: username.trim() || "root",
    authType: "tailscale" as const,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Success and API-key/upstream failures share the same response envelope. */
export function parseTailscaleDevicesResponse(
  data: unknown,
): TailscaleDevicesResult | null {
  if (
    !isRecord(data) ||
    !Array.isArray(data.devices) ||
    typeof data.hasApiKey !== "boolean" ||
    (data.error !== undefined && typeof data.error !== "string")
  ) {
    return null;
  }

  const devices: TailscaleDevice[] = [];
  for (const device of data.devices) {
    if (!isRecord(device) || typeof device.id !== "string") continue;
    devices.push({
      id: device.id,
      name: typeof device.name === "string" ? device.name : "",
      hostname: typeof device.hostname === "string" ? device.hostname : "",
      addresses: Array.isArray(device.addresses)
        ? device.addresses.filter(
            (address): address is string => typeof address === "string",
          )
        : [],
      os: typeof device.os === "string" ? device.os : "",
      lastSeen: typeof device.lastSeen === "string" ? device.lastSeen : "",
    });
  }

  return {
    devices,
    hasApiKey: data.hasApiKey,
    ...(data.error !== undefined ? { error: data.error } : {}),
  };
}
