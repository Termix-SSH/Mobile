import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}

/** The search and command palette, opened from any screen header. */
export const palette = {
  open: () => set(true),
  close: () => set(false),
  isOpen: () => open,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function usePaletteOpen(): boolean {
  return useSyncExternalStore(
    palette.subscribe,
    palette.isOpen,
    palette.isOpen,
  );
}
