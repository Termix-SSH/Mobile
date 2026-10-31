import { useSyncExternalStore } from "react";
import type { SessionTabStatus } from "@/core/features/types";
import type { ConnectionStatus } from "@/core/transport";

/** How a session tab's connection is doing, the same for every kind of tab. */
export type SessionStatusEntry = SessionTabStatus;
export type SessionState = SessionTabStatus["state"];

/** States that keep a connection open, so the background service stays on. */
export function isLive(state: SessionState): boolean {
  return (
    state === "connecting" ||
    state === "connected" ||
    state === "reconnecting" ||
    state === "offline"
  );
}

/** A HostConnection state as a tab status. */
export function statusFromConnection(s: ConnectionStatus): SessionStatusEntry {
  switch (s.status) {
    case "idle":
      // A restored tab that waits to be shown before it connects.
      return { state: "idle" };
    case "connecting":
    case "prompt":
      return { state: "connecting" };
    case "connected":
      return { state: "connected" };
    case "reconnecting":
      return { state: "reconnecting", reason: s.reason };
    case "offline":
      return { state: "offline", reason: s.reason };
    case "failed":
      return { state: "failed", reason: s.failure.message };
    case "closed":
      return { state: "closed" };
  }
}

type Snapshot = Readonly<Record<string, SessionStatusEntry>>;

/** Status of every open tab by tab id. Feeds the tab bar and the notification. */
export class SessionStatusStore {
  private snapshot: Snapshot = {};
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Snapshot => this.snapshot;

  get(id: string): SessionStatusEntry | undefined {
    return this.snapshot[id];
  }

  set(id: string, entry: SessionStatusEntry) {
    const prev = this.snapshot[id];
    if (prev && prev.state === entry.state && prev.reason === entry.reason)
      return;
    this.update({ ...this.snapshot, [id]: entry });
  }

  remove(id: string) {
    if (!(id in this.snapshot)) return;
    const next = { ...this.snapshot };
    delete next[id];
    this.update(next);
  }

  /** Forgets tabs that are no longer open. */
  retain(ids: Iterable<string>) {
    const keep = new Set(ids);
    const gone = Object.keys(this.snapshot).filter((id) => !keep.has(id));
    if (!gone.length) return;
    const next = { ...this.snapshot };
    gone.forEach((id) => delete next[id]);
    this.update(next);
  }

  private update(next: Snapshot) {
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }
}

export const sessionStatus = new SessionStatusStore();

export function useSessionStatuses(): Snapshot {
  return useSyncExternalStore(
    sessionStatus.subscribe,
    sessionStatus.getSnapshot,
    sessionStatus.getSnapshot,
  );
}
