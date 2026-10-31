import { PermissionsAndroid, Platform } from "react-native";
import {
  addDisconnectAllListener,
  beginGrace,
  endGrace,
  hideSessionService,
  isSessionServiceAvailable,
  isSessionServiceRunning,
  showSessionService,
  type ServiceContent,
} from "@/modules/termix-session-service";
import { plainStore } from "@/core/storage/kv";
import { sessionLifecycle, type SessionLifecycle } from "./lifecycle";
import {
  isLive,
  sessionStatus,
  type SessionState,
  type SessionStatusEntry,
  type SessionStatusStore,
} from "./status";

export const KEEP_IN_BACKGROUND_KEY = "sessions.keepInBackground";
const NOTIFICATIONS_ASKED_KEY = "sessions.notificationsAsked";

export interface ServiceTab {
  id: string;
  title: string;
}

const STATE_TEXT: Record<SessionState, string> = {
  idle: "Not connected",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  offline: "Waiting for network",
  failed: "Failed",
  closed: "Closed",
};

/** What the notification shows, or null when no session is open. */
export function serviceContent(
  tabs: ServiceTab[],
  statuses: Readonly<Record<string, SessionStatusEntry>>,
  tunnels: string[] = [],
): ServiceContent | null {
  const live = tabs.filter((t) => {
    const s = statuses[t.id];
    return !!s && isLive(s.state);
  });
  if (!live.length && !tunnels.length) return null;
  const count = (n: number, one: string, many: string) =>
    n === 1 ? `1 ${one}` : `${n} ${many}`;
  const parts = [
    live.length ? count(live.length, "session open", "sessions open") : "",
    tunnels.length
      ? count(tunnels.length, "tunnel active", "tunnels active")
      : "",
  ].filter(Boolean);
  return {
    title: parts.join(" | "),
    lines: [
      ...live.map((t) => `${t.title} | ${STATE_TEXT[statuses[t.id].state]}`),
      ...tunnels,
    ],
    actionLabel: "Disconnect all",
    channelName: "Sessions",
  };
}

interface Deps {
  platform: string;
  available: boolean;
  lifecycle: Pick<SessionLifecycle, "isActive" | "watch">;
  status: Pick<SessionStatusStore, "getSnapshot" | "subscribe">;
  service: {
    show: (c: ServiceContent) => boolean;
    hide: () => void;
    isRunning: () => boolean;
    beginGrace: () => void;
    endGrace: () => void;
    onDisconnectAll: (cb: () => void) => () => void;
  };
  askNotifications: () => Promise<void>;
}

const defaultDeps = (): Deps => ({
  platform: Platform.OS,
  available: isSessionServiceAvailable,
  lifecycle: sessionLifecycle,
  status: sessionStatus,
  service: {
    show: showSessionService,
    hide: hideSessionService,
    isRunning: isSessionServiceRunning,
    beginGrace,
    endGrace,
    onDisconnectAll: addDisconnectAllListener,
  },
  askNotifications,
});

/** Android 13+ needs a yes before the notification shows. Asked once. */
async function askNotifications(): Promise<void> {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) return;
  if (await plainStore.get(NOTIFICATIONS_ASKED_KEY)) return;
  await plainStore.set(NOTIFICATIONS_ASKED_KEY, "1").catch(() => {});
  await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    {
      title: "Show open sessions",
      message:
        "Termix shows a notification while sessions are open, so Android keeps them running in the background.",
      buttonPositive: "OK",
    },
  ).catch(() => {});
}

/**
 * Android: runs the foreground service while any session is open, with a
 * notification that lists them. iOS: asks for the short finishing time when
 * the app leaves the foreground with sessions open, nothing more.
 */
export class BackgroundSessions {
  private tabs: ServiceTab[] = [];
  private tunnels: string[] = [];
  private enabled = true;
  private changed = false;
  private shownKey = "";
  private grace = false;
  private stops: (() => void)[] = [];
  private deps: Deps | null = null;

  start(onDisconnectAll: () => void, deps: Deps = defaultDeps()) {
    this.stop();
    this.deps = deps;
    this.stops.push(
      deps.status.subscribe(() => this.sync()),
      deps.lifecycle.watch(() => this.sync()),
      deps.service.onDisconnectAll(() => {
        this.shownKey = "";
        onDisconnectAll();
      }),
    );
    plainStore
      .get(KEEP_IN_BACKGROUND_KEY)
      .then((v) => {
        // A toggle made while this loaded wins.
        if (this.changed) return;
        this.enabled = v !== "0";
        this.sync();
      })
      .catch(() => {});
    this.sync();
  }

  stop() {
    this.stops.forEach((s) => s());
    this.stops = [];
  }

  setTabs(tabs: ServiceTab[]) {
    this.tabs = tabs;
    this.sync();
  }

  /** Lines for the running phone tunnels, like "host | Connected". */
  setTunnels(lines: string[]) {
    if (JSON.stringify(lines) === JSON.stringify(this.tunnels)) return;
    this.tunnels = lines;
    this.sync();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  async setEnabled(on: boolean) {
    this.changed = true;
    this.enabled = on;
    await plainStore.set(KEEP_IN_BACKGROUND_KEY, on ? "1" : "0");
    this.sync();
  }

  sync() {
    const deps = this.deps;
    if (!deps) return;
    const content = serviceContent(
      this.tabs,
      deps.status.getSnapshot(),
      this.tunnels,
    );
    if (deps.platform === "ios") {
      const away = !deps.lifecycle.isActive;
      if (away && content && !this.grace) {
        this.grace = true;
        deps.service.beginGrace();
      } else if (!away && this.grace) {
        this.grace = false;
        deps.service.endGrace();
      }
      return;
    }
    if (deps.platform !== "android" || !deps.available) return;
    const running = deps.service.isRunning();
    if (!content || !this.enabled) {
      if (running) deps.service.hide();
      this.shownKey = "";
      return;
    }
    const key = JSON.stringify(content);
    if (running && key === this.shownKey) return;
    // Android does not let a background app start the service.
    if (!running && !deps.lifecycle.isActive) return;
    if (!running) void deps.askNotifications();
    this.shownKey = deps.service.show(content) ? key : "";
  }
}

export const backgroundSessions = new BackgroundSessions();
