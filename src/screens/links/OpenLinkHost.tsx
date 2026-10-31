import { useCallback, useEffect, useRef } from "react";
import { Linking } from "react-native";
import { useRootNavigationState } from "expo-router";
import { useAppContext } from "@/contexts/AppContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { accounts, accountLabel, isServerAccount } from "@/core/accounts";
import { repositoriesFor } from "@/core/data/repositories";
import {
  findLinkAccount,
  findLinkHost,
  parseOpenLink,
  type OpenLink,
} from "@/core/links/open-link";
import { toast } from "@/utils/toast";
import { openTab } from "@/screens/shell/navigate";

/**
 * Handles `termix-mobile://open` links: picks the account for the link's
 * server, switches to it and opens the host. A link that needs a sign in or
 * arrives before the app is up waits and runs after.
 */
export function OpenLinkHost() {
  const { isAuthenticated, openAuthFlow } = useAppContext();
  const { navigateToSessions } = useTerminalSessions();
  const ready = Boolean(useRootNavigationState()?.key);
  // A link waiting for the app, or for a sign in when `auth` is set.
  const pending = useRef<{ link: OpenLink; auth: boolean } | null>(null);
  const last = useRef<{ url: string; at: number } | null>(null);
  // Android hands the same startup link to every relaunch; use it once.
  const initialRead = useRef(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const run = useCallback(
    async (link: OpenLink) => {
      const account = findLinkAccount(accounts.list(), link.server);
      if (!account) {
        toast.error(
          "Link this server first",
          `${link.server ?? ""} isn't linked in the app yet.`,
        );
        openAuthFlow("server");
        return;
      }
      if (accounts.active().id !== account.id) {
        await accounts.setActive(account.id);
      }
      const client = isServerAccount(account)
        ? accounts.client(account.id)
        : null;
      if (isServerAccount(account) && !client?.isAuthenticated()) {
        pending.current = { link, auth: true };
        openAuthFlow("login");
        return;
      }
      if (link.hostId === null) {
        openTab("/(tabs)/hosts");
        return;
      }
      try {
        const hosts = await repositoriesFor(account, client).hosts.list();
        const host = findLinkHost(hosts, link.hostId, isServerAccount(account));
        if (!host) {
          toast.error(
            "That host isn't here",
            `No host with id ${link.hostId} on ${accountLabel(account)}.`,
          );
          openTab("/(tabs)/hosts");
          return;
        }
        if (link.type) navigateToSessions(host, link.type);
        else navigateToSessions(host);
      } catch {
        toast.error("Could not open that host");
      }
    },
    [navigateToSessions, openAuthFlow],
  );

  const handle = useCallback(
    (url: string | null) => {
      if (!url) return;
      const link = parseOpenLink(url);
      if (!link) return;
      const now = Date.now();
      // The same link can come from the listener and the startup link.
      if (last.current?.url === url && now - last.current.at < 1500) return;
      last.current = { url, at: now };
      if (!readyRef.current) {
        pending.current = { link, auth: false };
        return;
      }
      void run(link);
    },
    [run],
  );

  useEffect(() => {
    const sub = Linking.addEventListener("url", (event) => handle(event.url));
    if (!initialRead.current) {
      initialRead.current = true;
      void Linking.getInitialURL()
        .then(handle)
        .catch(() => {});
    }
    return () => sub.remove();
  }, [handle]);

  // Runs a waiting link once the app is up or the sign in went through.
  useEffect(() => {
    const waiting = pending.current;
    if (!ready || !waiting) return;
    if (waiting.auth && !isAuthenticated) return;
    pending.current = null;
    void run(waiting.link);
  }, [ready, isAuthenticated, run]);

  return null;
}
