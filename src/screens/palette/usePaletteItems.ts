import { useMemo } from "react";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  FileText,
  Link,
  Plus,
  Server,
  Settings,
  Users,
  Zap,
} from "lucide-react-native";
import { useAppContext } from "@/contexts/AppContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { useActiveAccount } from "@/core/accounts";
import { useLiveList, useRepositories } from "@/core/data/hooks";
import {
  features,
  useCapability,
  useQuickActions,
  useTools,
  type ToolDef,
} from "@/core/features";
import { useRecentHosts } from "@/core/hosts/recent";
import { sessionHandles } from "@/core/sessions/handles";
import {
  hostContext,
  inputsOf,
  resolveSnippet,
  sendToTerminal,
  snippetMode,
} from "@/features/snippets/run";
import { useSettingsGroups } from "@/screens/settings/schema";
import { useOpenHost } from "@/screens/hosts/useOpenHost";
import type { Snippet } from "@/types";
import { toast } from "@/utils/toast";
import type { PaletteItem } from "./search";
import { openTab } from "@/screens/shell/navigate";

/**
 * Everything the palette can find: hosts, snippets, actions and settings.
 * `pickHost` asks for a host for tools that run on one.
 */
export function usePaletteItems({
  close,
  pickHost,
}: {
  close: () => void;
  pickHost: (tool: ToolDef) => void;
}): PaletteItem[] {
  const router = useRouter();
  const account = useActiveAccount();
  const repos = useRepositories();
  const { openAccountSwitcher, openAuthFlow } = useAppContext();
  const { sessions, activeSessionId, navigateToSessions } =
    useTerminalSessions();
  const openHost = useOpenHost();
  const tools = useTools();
  const quick = useQuickActions();
  const settingsGroups = useSettingsGroups();
  const canQuickConnect = useCapability("host.quickConnect");
  const hosts = useLiveList(repos.hosts, () => repos.hosts.list(), [repos]);
  const snippets = useLiveList<Snippet>(
    repos.snippets,
    () => repos.snippets.list().catch(() => []),
    [repos],
  );
  const recent = useRecentHosts(account.id, hosts.data);

  return useMemo(() => {
    const go = (href: string) => () => {
      close();
      if (href.startsWith("/(tabs)")) openTab(href);
      else router.push(href as never);
    };
    const recentIds = new Set(recent.slice(0, 5).map((h) => h.id));
    const active = sessions.find((s) => s.id === activeSessionId);
    const terminal =
      active && features.sessionHas(active.type, "terminal-input")
        ? active
        : null;

    const items: PaletteItem[] = hosts.data.map((host) => ({
      id: `host:${host.id}`,
      section: "hosts",
      label: host.name || host.ip,
      detail: `${host.username ? `${host.username}@` : ""}${host.ip}`,
      keywords: [host.folder ?? "", ...(host.tags ?? [])],
      icon: Server,
      suggested: recentIds.has(host.id),
      run: () => {
        close();
        void openHost(host).then((opened) => {
          if (!opened) openTab("/(tabs)/hosts");
        });
      },
    }));

    for (const snippet of snippets.data) {
      const asks = inputsOf(snippet).length > 0;
      items.push({
        id: `snippet:${snippet.id}`,
        section: "snippets",
        label: snippet.name,
        detail:
          terminal && !asks ? `Run in ${terminal.title}` : snippet.content,
        keywords: [snippet.content, snippet.folder ?? ""],
        icon: FileText,
        run: () => {
          close();
          const handle = terminal ? sessionHandles.get(terminal.id) : null;
          if (handle && terminal && !asks) {
            const text = resolveSnippet(snippet, hostContext(terminal.host));
            sendToTerminal(handle, text, snippetMode(snippet));
            void navigateToSessions();
            return;
          }
          void Clipboard.setStringAsync(snippet.content);
          toast.success(
            asks
              ? "Copied. Run it from the terminal's snippets to fill in its values."
              : "Copied. Open a terminal to run snippets.",
          );
        },
      });
    }

    items.push({
      id: "action:add-host",
      section: "actions",
      label: "Add host",
      icon: Plus,
      suggested: true,
      run: () => {
        close();
        openTab("/(tabs)/hosts?action=new");
      },
    });
    if (canQuickConnect) {
      items.push({
        id: "action:quick-connect",
        section: "actions",
        label: "Quick connect",
        detail: "user@host:port",
        icon: Zap,
        suggested: true,
        run: () => {
          close();
          openTab("/(tabs)/hosts?action=quick");
        },
      });
    }
    items.push(
      {
        id: "action:switch-account",
        section: "actions",
        label: "Switch account",
        icon: Users,
        run: () => {
          close();
          openAccountSwitcher();
        },
      },
      {
        id: "action:link-server",
        section: "actions",
        label: "Link a server",
        icon: Link,
        run: () => {
          close();
          openAuthFlow("server");
        },
      },
    );
    for (const tool of tools) {
      items.push({
        id: `tool:${tool.id}`,
        section: "actions",
        label: tool.label,
        detail: tool.description,
        icon: tool.icon,
        run: tool.tabType
          ? () => pickHost(tool)
          : go(tool.href ?? "/(tabs)/tools"),
      });
    }
    for (const action of quick.actions) {
      items.push({
        id: `quick:${action.id}`,
        section: "actions",
        label: action.label,
        detail: "From your server",
        icon: action.icon,
        run: () => {
          close();
          action.run(quick.ctx);
        },
      });
    }

    items.push({
      id: "settings:home",
      section: "settings",
      label: "Settings",
      detail: "Accounts, appearance, security",
      icon: Settings,
      run: go("/(tabs)/settings"),
    });
    for (const { section, items: entries } of settingsGroups) {
      for (const entry of entries) {
        items.push({
          id: `settings:${entry.id}`,
          section: "settings",
          label: entry.label,
          detail: entry.description ?? section.title,
          keywords: [section.title, ...(entry.keywords ?? [])],
          icon: entry.icon,
          // Switches and pickers have no screen, so open Settings searching for them.
          run: go(
            entry.href ??
              `/(tabs)/settings?q=${encodeURIComponent(entry.label)}`,
          ),
        });
      }
    }
    return items;
  }, [
    account.kind,
    activeSessionId,
    canQuickConnect,
    close,
    hosts.data,
    settingsGroups,
    navigateToSessions,
    openAccountSwitcher,
    openAuthFlow,
    openHost,
    pickHost,
    quick,
    recent,
    router,
    sessions,
    snippets.data,
    tools,
  ]);
}
