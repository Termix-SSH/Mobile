import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Play, Server as ServerIcon } from "lucide-react-native";
import { executeSnippet, getSSHHosts } from "@/app/main-axios";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { BottomSheet, SheetRow, Text } from "@/app/components/ui";
import { toast } from "@/app/utils/toast";
import { systemLogger } from "@/lib/frontend-logger";
import type { SSHHost, Snippet } from "@/types";

/** Remembers the host a widget-run snippet last targeted. */
const LAST_HOST_KEY = "widgetSnippetLastHostId";

interface RunSnippetSheetProps {
  /** The snippet a widget tap resolved to, or null when nothing is pending. */
  snippet: Snippet | null;
  onClose: () => void;
}

/**
 * Target picker for a snippet launched from the home screen.
 *
 * A snippet has no host of its own, so a widget tap can't know where to run.
 * Rather than guessing, this asks — which doubles as the confirmation step that
 * a home-screen tap otherwise lacks: running a shell command on a server should
 * never happen by accident. The last target is remembered and offered first, so
 * the common case is two taps.
 */
export function RunSnippetSheet({ snippet, onClose }: RunSnippetSheetProps) {
  const color = useThemeColor();

  const [hosts, setHosts] = useState<SSHHost[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningHostId, setRunningHostId] = useState<number | null>(null);
  const [lastHostId, setLastHostId] = useState<number | null>(null);

  const visible = snippet !== null;

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [list, storedHostId] = await Promise.all([
          getSSHHosts(),
          AsyncStorage.getItem(LAST_HOST_KEY).catch(() => null),
        ]);
        if (cancelled) return;

        const parsed = Number.parseInt(storedHostId ?? "", 10);
        setLastHostId(Number.isInteger(parsed) ? parsed : null);
        setHosts(Array.isArray(list) ? list : []);
      } catch (error) {
        if (cancelled) return;
        setHosts([]);
        toast.error("Could not load your hosts.");
        systemLogger.warn("[widgets] failed to load hosts for snippet run", {
          operation: "widgets",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const run = useCallback(
    async (host: SSHHost) => {
      if (!snippet || runningHostId !== null) return;

      setRunningHostId(host.id);
      try {
        const result = await executeSnippet(snippet.id, host.id);
        AsyncStorage.setItem(LAST_HOST_KEY, String(host.id)).catch(() => {});

        if (result?.success === false) {
          toast.error(result.error || `${snippet.name} failed on ${host.name}`);
        } else {
          // Show the first line of output when there is any — a bare "ran it"
          // leaves the user guessing whether anything happened.
          const preview = (result?.output ?? "").trim().split("\n")[0];
          toast.success(
            preview
              ? `${snippet.name} on ${host.name}: ${preview.slice(0, 80)}`
              : `Ran ${snippet.name} on ${host.name}`,
          );
        }
        onClose();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to run snippet";
        toast.error(message);
      } finally {
        setRunningHostId(null);
      }
    },
    [snippet, runningHostId, onClose],
  );

  // Suggest the previous target first, then the rest in their usual order.
  const ordered = [...hosts].sort((a, b) => {
    if (a.id === lastHostId) return -1;
    if (b.id === lastHostId) return 1;
    return 0;
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={runningHostId === null ? onClose : () => {}}
      title={snippet ? `Run "${snippet.name}" on` : "Run snippet"}
    >
      {snippet?.content ? (
        <View className="border-b border-border bg-card px-4 py-2.5">
          <Text
            className="text-[11px] text-muted-foreground"
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {snippet.content.trim()}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View className="items-center gap-2 py-8">
          <ActivityIndicator color={color("accent-brand")} />
          <Text className="text-xs text-muted-foreground">Loading hosts…</Text>
        </View>
      ) : ordered.length === 0 ? (
        <View className="items-center gap-1 px-4 py-8">
          <Text weight="medium" className="text-sm text-foreground">
            No hosts available
          </Text>
          <Text className="text-center text-[11px] text-muted-foreground">
            Add a host in Termix to run snippets from your home screen.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 340 }}>
          {ordered.map((host) => (
            <SheetRow
              key={host.id}
              icon={
                runningHostId === host.id ? (
                  <ActivityIndicator
                    size="small"
                    color={color("accent-brand")}
                  />
                ) : host.id === lastHostId ? (
                  <Play size={16} color={color("accent-brand")} />
                ) : (
                  <ServerIcon size={16} color={color("muted-foreground")} />
                )
              }
              label={host.name || host.ip}
              onPress={() => run(host)}
              trailing={
                <Text className="text-[10px] text-muted-foreground">
                  {host.id === lastHostId ? "Last used" : host.ip}
                </Text>
              }
            />
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}
