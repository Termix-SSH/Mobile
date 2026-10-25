import { useEffect, useRef } from "react";
import { router, useRootNavigationState } from "expo-router";

import { FrameMonitor } from "@/modules/termix-frame-monitor";
import { labEnabled } from "./enabled";

/** Turns a lab deep link into the route path, or null if it is not one. */
export function labRouteFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^[a-z][a-z0-9+.-]*:\/\/dev\/(terminal-lab|list-lab)(\?.*)?$/i.exec(
    url,
  );
  return m ? `/dev/${m[1]}${m[2] ?? ""}` : null;
}

/**
 * Opens the lab when CI started the app with a lab URL in its environment
 * (the iOS simulator asks before opening custom scheme links).
 */
export function LabLaunch() {
  const nav = useRootNavigationState();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !nav?.key || !labEnabled() || !FrameMonitor) return;
    const route = labRouteFromUrl(FrameMonitor.launchUrl());
    if (!route) return;
    done.current = true;
    router.replace(route as never);
  }, [nav?.key]);
  return null;
}
