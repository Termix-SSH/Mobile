import { requireOptionalNativeModule } from "expo-modules-core";

export type TermixTailscaleConfig = {
  authKey: string;
  hostname?: string;
  /** Absolute path for tsnet state. Defaults to a native app-support path. */
  stateDir?: string;
  ephemeral?: boolean;
};

export type ForwardProtocol = "http:" | "https:";

export type ForwardHandle = {
  protocol: ForwardProtocol;
  remoteHost: string;
  remotePort: number;
  localPort: number;
};

type NativeModule = {
  isAvailable(): boolean;
  getNativeLoadError?(): string;
  configure(options: {
    authKey: string;
    hostname: string;
    stateDir: string;
    ephemeral: boolean;
  }): Promise<void>;
  up(): Promise<void>;
  startForward(
    protocol: ForwardProtocol,
    remoteHost: string,
    remotePort: number,
  ): Promise<number>;
  stopForward(
    protocol: ForwardProtocol,
    remoteHost: string,
    remotePort: number,
    localPort: number,
  ): Promise<void>;
  stopAllForwards(): Promise<void>;
  isForwardActive?(
    protocol: ForwardProtocol,
    remoteHost: string,
    remotePort: number,
    localPort: number,
  ): Promise<boolean>;
  isUp(): Promise<boolean>;
  getIPs(): Promise<string>;
  close(): Promise<void>;
  getDefaultStateDir(): Promise<string>;
};

const Native = requireOptionalNativeModule<NativeModule>("TermixTailscale");

/** True when the native module is linked (dev client / production build). */
export function isTermixTailscaleAvailable(): boolean {
  return !!Native?.isAvailable?.();
}

/**
 * Returns a safe native-loader diagnostic when the module is linked but its
 * platform libraries could not be loaded. It never includes app credentials.
 */
export function getTermixTailscaleNativeLoadError(): string | null {
  if (!Native || Native.isAvailable()) return null;
  const message = Native.getNativeLoadError?.() ?? "";
  return message.trim() || null;
}

export async function configureTermixTailscale(
  config: TermixTailscaleConfig,
): Promise<void> {
  if (!Native) {
    throw new Error(
      "Termix Tailscale native module is not available. Use a custom dev client build.",
    );
  }
  const stateDir =
    config.stateDir?.trim() || (await Native.getDefaultStateDir());
  await Native.configure({
    authKey: config.authKey.trim(),
    hostname: (config.hostname || "termix-mobile").trim(),
    stateDir,
    ephemeral: !!config.ephemeral,
  });
}

export async function upTermixTailscale(): Promise<void> {
  if (!Native)
    throw new Error("Termix Tailscale native module is not available");
  await Native.up();
}

export async function startTermixTailscaleForward(
  protocol: ForwardProtocol,
  remoteHost: string,
  remotePort: number,
): Promise<ForwardHandle> {
  if (!Native)
    throw new Error("Termix Tailscale native module is not available");
  const localPort = await Native.startForward(protocol, remoteHost, remotePort);
  return { protocol, remoteHost, remotePort, localPort };
}

export async function stopTermixTailscaleForward(
  handle: ForwardHandle,
): Promise<void> {
  if (!Native) return;
  await Native.stopForward(
    handle.protocol,
    handle.remoteHost,
    handle.remotePort,
    handle.localPort,
  );
}

export async function stopAllTermixTailscaleForwards(): Promise<void> {
  if (!Native) return;
  await Native.stopAllForwards();
}

export async function isTermixTailscaleForwardActive(
  handle: ForwardHandle,
): Promise<boolean> {
  if (!Native?.isForwardActive) return false;
  return Native.isForwardActive(
    handle.protocol,
    handle.remoteHost,
    handle.remotePort,
    handle.localPort,
  );
}

export async function isTermixTailscaleUp(): Promise<boolean> {
  if (!Native) return false;
  return Native.isUp();
}

export async function getTermixTailscaleIPs(): Promise<string[]> {
  if (!Native) return [];
  const raw = await Native.getIPs();
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function closeTermixTailscale(): Promise<void> {
  if (!Native) return;
  await Native.close();
}
