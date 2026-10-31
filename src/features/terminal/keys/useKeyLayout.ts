import { useCallback, useEffect, useState } from "react";
import { useSessionRepositories } from "@/core/data/hooks";
import type { SSHHost } from "@/types";
import { useKeyPrefs } from "./KeyPrefsContext";
import { readLayout, type KeyLayout } from "./model";

/** The host pref that holds a host's own layout. */
export const HOST_LAYOUT_PREF = "keyLayout";

/**
 * The layout for a host's terminal: its own when it has one, else the
 * global one. `own` says which.
 */
export function useKeyLayout(host?: SSHHost | null) {
  const { layout: global } = useKeyPrefs();
  const prefs = useSessionRepositories().hostPrefs;
  const [own, setOwn] = useState<KeyLayout | null>(null);

  useEffect(() => {
    if (!host) {
      setOwn(null);
      return;
    }
    let alive = true;
    const load = () =>
      prefs
        .get(host, HOST_LAYOUT_PREF)
        .then((raw) => alive && setOwn(raw ? readLayout(raw) : null))
        .catch(() => {});
    void load();
    const off = prefs.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [host, prefs]);

  const setHostLayout = useCallback(
    async (layout: KeyLayout | null) => {
      if (!host) return;
      setOwn(layout);
      await prefs.set(
        host,
        HOST_LAYOUT_PREF,
        layout ? JSON.stringify(layout) : null,
      );
    },
    [host, prefs],
  );

  return { layout: own ?? global, own: own !== null, setHostLayout };
}
