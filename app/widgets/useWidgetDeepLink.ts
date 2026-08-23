/**
 * Handles taps on home-screen widgets.
 *
 * Widgets open `termix-mobile://widget/...` links. This hook owns that prefix
 * (the OIDC flow owns `termix-mobile://oidc-callback`, so the two never
 * collide) and turns a link into the same in-app navigation a tap on the Hosts
 * list would produce.
 *
 * Cold starts are handled too: a link that arrives before the user is
 * authenticated is parked and replayed once sign-in completes.
 *
 * Host links open a session directly. Snippet links resolve the snippet and
 * hand it to the caller, which asks which host to run it on — see
 * ./RunSnippetSheet.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { router } from "expo-router";
import { useAppContext } from "@/app/AppContext";
import {
  useTerminalSessions,
  type SessionType,
} from "@/app/contexts/TerminalSessionsContext";
import { getSSHHosts, getSnippets } from "@/app/main-axios";
import { systemLogger } from "@/lib/frontend-logger";
import { toast } from "@/app/utils/toast";
import type { Snippet } from "@/types";
import { WIDGET_LINK_PREFIX } from "./types";

/** Session types a widget link is allowed to open. */
const ALLOWED_SESSION_TYPES: SessionType[] = [
  "terminal",
  "stats",
  "filemanager",
];

interface WidgetLink {
  action: "connect" | "snippet" | "snippets" | "open";
  hostId?: number;
  snippetId?: number;
  type: SessionType;
}

/**
 * Parses a widget deep link. Returns null for anything that isn't ours or that
 * carries values we don't recognise — a widget must never be able to steer the
 * app somewhere unexpected.
 */
export function parseWidgetLink(url: string): WidgetLink | null {
  if (!url || !url.startsWith(WIDGET_LINK_PREFIX)) return null;

  const rest = url.slice(WIDGET_LINK_PREFIX.length);
  const [pathPart, queryPart = ""] = rest.split("?");
  const action = pathPart.replace(/^\/+/, "").replace(/\/+$/, "");

  if (action === "open" || action === "") {
    return { action: "open", type: "terminal" };
  }

  // The snippets list, opened without copying anything.
  if (action === "snippets") {
    return { action: "snippets", type: "terminal" };
  }

  const params = new URLSearchParams(queryPart);

  if (action === "snippet") {
    const snippetId = Number.parseInt(params.get("snippetId") ?? "", 10);
    if (!Number.isInteger(snippetId) || snippetId <= 0) return null;
    return { action: "snippet", snippetId, type: "terminal" };
  }

  if (action !== "connect") return null;

  const hostId = Number.parseInt(params.get("hostId") ?? "", 10);
  if (!Number.isInteger(hostId) || hostId <= 0) return null;

  const requested = params.get("type") ?? "terminal";
  const type = (ALLOWED_SESSION_TYPES as string[]).includes(requested)
    ? (requested as SessionType)
    : "terminal";

  return { action: "connect", hostId, type };
}

export function useWidgetDeepLink(): {
  /** Snippet awaiting a target host, or null. */
  pendingSnippet: Snippet | null;
  dismissSnippet: () => void;
} {
  const { isAuthenticated } = useAppContext();
  const { navigateToSessions } = useTerminalSessions();

  /** Snippet resolved from a widget tap, waiting for the user to pick a host. */
  const [pendingSnippet, setPendingSnippet] = useState<Snippet | null>(null);

  /** Link received before we could act on it (cold start / signed out). */
  const pendingRef = useRef<WidgetLink | null>(null);
  /** Guards against the same URL being delivered twice (listener + initial). */
  const lastHandledRef = useRef<{ url: string; at: number } | null>(null);
  const authenticatedRef = useRef(isAuthenticated);
  authenticatedRef.current = isAuthenticated;

  /**
   * Resolves the snippet a widget tap referenced. The widget only carries the
   * id; the command itself is read here, inside the authenticated app, and is
   * then handed to the run sheet so the user picks a target host.
   */
  const runSnippetLink = useCallback(async (snippetId: number) => {
    try {
      const snippets = await getSnippets();
      const snippet = Array.isArray(snippets)
        ? snippets.find((candidate: Snippet) => candidate.id === snippetId)
        : undefined;

      if (!snippet) {
        toast.error("That snippet no longer exists.");
        router.push("/tabs/settings/Snippets" as never);
        return;
      }

      setPendingSnippet(snippet);
    } catch (error) {
      systemLogger.warn("[widgets] failed to open snippet from widget", {
        operation: "widgets",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      toast.error("Could not open that snippet.");
      router.push("/tabs/settings/Snippets" as never);
    }
  }, []);

  const runLink = useCallback(
    async (link: WidgetLink) => {
      if (link.action === "snippets") {
        router.push("/tabs/settings/Snippets" as never);
        return;
      }

      if (link.action === "snippet" && link.snippetId !== undefined) {
        await runSnippetLink(link.snippetId);
        return;
      }

      if (link.action === "open" || link.hostId === undefined) {
        router.push("/(tabs)/hosts");
        return;
      }

      try {
        const hosts = await getSSHHosts();
        const host = Array.isArray(hosts)
          ? hosts.find((candidate) => candidate.id === link.hostId)
          : undefined;

        if (!host) {
          toast.error("That host no longer exists.");
          router.push("/(tabs)/hosts");
          return;
        }

        navigateToSessions(host, link.type);
      } catch (error) {
        systemLogger.warn("[widgets] failed to open host from widget", {
          operation: "widgets",
          hostId: link.hostId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        toast.error("Could not open that host.");
        router.push("/(tabs)/hosts");
      }
    },
    [navigateToSessions, runSnippetLink],
  );

  const handleUrl = useCallback(
    (url: string | null) => {
      if (!url) return;

      const now = Date.now();
      const last = lastHandledRef.current;
      if (last && last.url === url && now - last.at < 1000) return;

      const link = parseWidgetLink(url);
      if (!link) return;
      lastHandledRef.current = { url, at: now };

      if (!authenticatedRef.current) {
        // Park it: the effect below replays it the moment sign-in lands.
        pendingRef.current = link;
        router.push("/(tabs)/hosts");
        return;
      }

      void runLink(link);
    },
    [runLink],
  );

  useEffect(() => {
    const subscription = Linking.addEventListener("url", (event) => {
      handleUrl(event.url);
    });
    void Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => {
        // No initial URL is the normal case.
      });
    return () => subscription.remove();
  }, [handleUrl]);

  // Replay a parked link once the user is authenticated.
  useEffect(() => {
    if (!isAuthenticated) return;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    void runLink(pending);
  }, [isAuthenticated, runLink]);

  // Signing out mid-flight must close the run sheet with it.
  useEffect(() => {
    if (!isAuthenticated) setPendingSnippet(null);
  }, [isAuthenticated]);

  const dismissSnippet = useCallback(() => setPendingSnippet(null), []);

  return { pendingSnippet, dismissSnippet };
}
