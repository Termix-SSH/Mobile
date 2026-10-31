import { AppState, type AppStateStatus } from "react-native";
import * as Battery from "expo-battery";
import * as Network from "expo-network";
import type { NetworkInfo } from "@/core/transport";

/** Anything holding a connection that cares about the app and the network. */
export interface LifecycleTarget {
  notifyBackgrounded?(): void;
  notifyForegrounded?(): void;
  notifyNetworkChanged?(info: NetworkInfo): void;
  setLowPower?(on: boolean): void;
}

export interface NetworkSample {
  connected: boolean;
  type: string;
  vpn: boolean;
  ip: string | null;
}

/** Whether the way out changed between two samples. */
export function networkChanged(
  prev: NetworkSample | null,
  next: NetworkSample,
): boolean {
  if (!prev) return false;
  if (prev.connected !== next.connected) return true;
  if (!next.connected) return false;
  if (prev.type !== next.type || prev.vpn !== next.vpn) return true;
  return !!prev.ip && !!next.ip && prev.ip !== next.ip;
}

const TYPE_NAMES: Record<string, string> = {
  WIFI: "Wi-Fi",
  CELLULAR: "mobile data",
  ETHERNET: "ethernet",
  VPN: "VPN",
  BLUETOOTH: "bluetooth",
  WIMAX: "WiMAX",
  OTHER: "other",
  UNKNOWN: "unknown",
  NONE: "none",
};

export function sampleFrom(
  state: { type?: string | null; isConnected?: boolean | null },
  ip: string | null = null,
): NetworkSample {
  const type = String(state.type ?? "UNKNOWN");
  return {
    connected: state.isConnected !== false && type !== "NONE",
    type: TYPE_NAMES[type] ?? type.toLowerCase(),
    vpn: type === "VPN",
    ip: ip && ip !== "0.0.0.0" ? ip : null,
  };
}

/**
 * One listener for the app state, the network and low power mode, shared by
 * every open session. Connections register here instead of each adding its
 * own listeners.
 */
export class SessionLifecycle {
  private targets = new Set<LifecycleTarget>();
  private watchers = new Set<() => void>();
  private appState: AppStateStatus = AppState.currentState ?? "active";
  private away = false;
  private net: NetworkSample | null = null;
  private lowPower = false;
  private started = false;
  private stops: (() => void)[] = [];

  get isActive(): boolean {
    return this.appState === "active";
  }

  get network(): NetworkSample | null {
    return this.net;
  }

  get isLowPower(): boolean {
    return this.lowPower;
  }

  register(target: LifecycleTarget): () => void {
    this.targets.add(target);
    if (this.net)
      target.notifyNetworkChanged?.({ ...this.net, changed: false });
    if (this.lowPower) target.setLowPower?.(true);
    return () => {
      this.targets.delete(target);
    };
  }

  /** Called on any change, for things that only need to look again. */
  watch(listener: () => void): () => void {
    this.watchers.add(listener);
    return () => {
      this.watchers.delete(listener);
    };
  }

  start() {
    if (this.started) return;
    this.started = true;
    const app = AppState.addEventListener("change", (s) => this.onAppState(s));
    this.stops.push(() => app.remove());
    try {
      const net = Network.addNetworkStateListener((e) => {
        void this.onNetwork(e);
      });
      this.stops.push(() => net.remove());
      Network.getNetworkStateAsync()
        .then((e) => this.onNetwork(e))
        .catch(() => {});
    } catch {}
    try {
      const power = Battery.addLowPowerModeListener((e) =>
        this.onLowPower(e.lowPowerMode),
      );
      this.stops.push(() => power.remove());
      Battery.isLowPowerModeEnabledAsync()
        .then((on) => this.onLowPower(on))
        .catch(() => {});
    } catch {}
  }

  /** Test seam. */
  stop() {
    this.stops.forEach((s) => s());
    this.stops = [];
    this.started = false;
  }

  onAppState(next: AppStateStatus) {
    this.appState = next;
    // "inactive" (a pulled down shade, the app switcher) is not a trip away.
    if (next === "background" && !this.away) {
      this.away = true;
      this.targets.forEach((t) => t.notifyBackgrounded?.());
    } else if (next === "active" && this.away) {
      this.away = false;
      this.targets.forEach((t) => t.notifyForegrounded?.());
    }
    this.emit();
  }

  async onNetwork(state: {
    type?: string | null;
    isConnected?: boolean | null;
  }) {
    let ip: string | null = null;
    if (state.isConnected !== false) {
      ip = await Network.getIpAddressAsync().catch(() => null);
    }
    const next = sampleFrom(state, ip);
    const prev = this.net;
    if (
      prev &&
      prev.connected === next.connected &&
      prev.type === next.type &&
      prev.vpn === next.vpn &&
      prev.ip === next.ip
    )
      return;
    const changed = networkChanged(prev, next);
    this.net = next;
    const info: NetworkInfo = {
      connected: next.connected,
      type: next.type,
      vpn: next.vpn,
      changed,
    };
    this.targets.forEach((t) => t.notifyNetworkChanged?.(info));
    this.emit();
  }

  onLowPower(on: boolean) {
    if (on === this.lowPower) return;
    this.lowPower = on;
    this.targets.forEach((t) => t.setLowPower?.(on));
    this.emit();
  }

  private emit() {
    this.watchers.forEach((w) => w());
  }
}

export const sessionLifecycle = new SessionLifecycle();
