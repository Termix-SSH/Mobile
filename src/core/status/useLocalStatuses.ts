import { useEffect, useMemo, useState } from "react";
import { isLanAvailable, tcpProbe } from "@/modules/termix-net";
import { sessionLifecycle } from "@/core/sessions";
import { SHOWCASE } from "@/showcase/enabled";
import { OFFLINE_IP } from "@/showcase/seed";
import type { SSHHost } from "@/types";
import { LocalStatusMonitor, type LocalStatus } from "./monitor";

const TICK_MS = 2000;

/**
 * Online or offline for hosts the phone can dial itself. Pass `enabled`
 * false when a server reports status, and nothing runs.
 */
export function useLocalStatuses(
  hosts: SSHHost[],
  enabled: boolean,
): Record<number, LocalStatus> {
  const monitor = useMemo(
    () =>
      new LocalStatusMonitor(
        SHOWCASE ? async (address) => address !== OFFLINE_IP : tcpProbe,
      ),
    [],
  );
  const [statuses, setStatuses] = useState<Record<number, LocalStatus>>({});
  const active = enabled && (SHOWCASE || isLanAvailable());

  useEffect(() => {
    if (!active) {
      monitor.setHosts([]);
      setStatuses({});
      return;
    }
    monitor.setHosts(hosts);
  }, [active, hosts, monitor]);

  useEffect(() => {
    if (!active) return;
    const off = monitor.subscribe(() => setStatuses(monitor.snapshot()));
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      monitor.refresh();
      void monitor.tick();
      timer = setInterval(() => void monitor.tick(), TICK_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const sync = () => (sessionLifecycle.isActive ? start() : stop());
    sync();
    const unwatch = sessionLifecycle.watch(sync);
    return () => {
      stop();
      unwatch();
      off();
    };
  }, [active, monitor]);

  return statuses;
}
