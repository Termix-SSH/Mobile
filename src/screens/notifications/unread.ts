import { useCallback, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import { activeClient } from "@/core/accounts";

// One unread count shared by every header bell and the inbox screen.
let count = 0;
const listeners = new Set<() => void>();

export function setUnread(next: number) {
  if (next === count) return;
  count = Math.max(0, next);
  listeners.forEach((l) => l());
}

export async function refreshUnread() {
  const client = activeClient();
  if (!client || !client.api.alerts.available()) return setUnread(0);
  try {
    setUnread(await client.api.alerts.unreadCount());
  } catch {
    // Keeps the last count when the server can't be reached.
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The unread alert count, checked again each time the screen is focused. */
export function useUnreadAlerts(): number {
  useFocusEffect(
    useCallback(() => {
      void refreshUnread();
    }, []),
  );
  return useSyncExternalStore(subscribe, () => count);
}
