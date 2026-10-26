import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import {
  History,
  Locate,
  LocateFixed,
  SquareTerminal,
} from "lucide-react-native";
import { ContextSheet } from "@/screens/sessions/shared";
import { useUiColors } from "@/contexts/ThemeContext";
import type { CompanionProps } from "@/core/features/types";
import { toast } from "@/utils/toast";
import { shellQuote } from "./backend/paths";
import { FileManager, type FileManagerHandle } from "./FileManager";
import {
  clearPaths,
  listPaths,
  recordPath,
  type PathHistory,
} from "./path-history";
import { updateFileSettings, useFileSettings } from "./settings";

export const FILES_TAB_TYPE = "filemanager";

function Tool({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-10 w-10 items-center justify-center active:bg-muted"
    >
      {children}
    </Pressable>
  );
}

/**
 * Files beside a terminal: opens in the terminal's folder, follows it while
 * shown, and can send the terminal to the folder on screen.
 */
export function CompanionFiles({
  session,
  getHandle,
  isVisible,
  layout,
  close,
}: CompanionProps) {
  const colors = useUiColors();
  const settings = useFileSettings();
  const files = useRef<FileManagerHandle>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<PathHistory>({
    frequent: [],
    recent: [],
  });
  const hostKey = `${session.accountId}:${session.host.id}`;
  const follow = settings.companionFollowTerminal;

  // The parent may pass a new function each render; keep the latest one.
  const handleRef = useRef(getHandle);
  handleRef.current = getHandle;
  const sync = useCallback(async () => {
    const path = await handleRef.current()?.getCwd?.();
    if (path) setCwd(path);
    return path ?? null;
  }, []);

  // Read the folder once when first shown, then keep checking while following.
  useEffect(() => {
    if (!isVisible) return;
    void sync();
    if (!follow) return;
    const id = setInterval(
      () => void sync(),
      settings.companionSyncInterval * 1000,
    );
    return () => clearInterval(id);
  }, [isVisible, follow, settings.companionSyncInterval, sync]);

  const cdTerminal = () => {
    const handle = handleRef.current();
    const path = files.current?.currentPath();
    if (!handle || !path) {
      toast.error("The terminal isn't open anymore");
      return;
    }
    handle.sendInput(`cd ${shellQuote(path)}\r`);
    setCwd(path);
  };

  const openHistory = async () => {
    setHistory(await listPaths(hostKey));
    setHistoryOpen(true);
  };

  const historyActions = [
    ...history.frequent.map((p) => ({
      key: `f:${p}`,
      icon: <LocateFixed size={16} color={colors.brand} />,
      label: p,
      onPress: () => files.current?.navigate(p),
    })),
    ...history.recent.map((p) => ({
      key: `r:${p}`,
      icon: <History size={16} color={colors.text} />,
      label: p,
      onPress: () => files.current?.navigate(p),
    })),
    (history.frequent.length > 0 || history.recent.length > 0) && {
      key: "clear",
      icon: <History size={16} color={colors.destructive} />,
      label: "Clear history",
      destructive: true,
      onPress: () => void clearPaths(hostKey),
    },
  ];

  return (
    <View className="flex-1 bg-background">
      <FileManager
        ref={files}
        host={session.host}
        type={FILES_TAB_TYPE}
        isVisible={isVisible}
        origin={session.origin}
        compact={layout === "side"}
        followPath={follow ? cwd : null}
        onPathChange={(p) =>
          void recordPath(hostKey, p, settings.companionHistorySize)
        }
        onClose={close}
        toolbarExtra={
          <>
            <Tool
              label={
                follow ? "Stop following the terminal" : "Follow the terminal"
              }
              onPress={() =>
                void updateFileSettings({ companionFollowTerminal: !follow })
              }
            >
              {follow ? (
                <LocateFixed size={17} color={colors.brand} />
              ) : (
                <Locate size={17} color={colors.text} />
              )}
            </Tool>
            <Tool
              label="Go to the terminal's folder"
              onPress={() =>
                void sync().then((p) => p && files.current?.navigate(p))
              }
            >
              <Locate size={17} color={colors.text} />
            </Tool>
            <Tool label="cd the terminal here" onPress={cdTerminal}>
              <SquareTerminal size={17} color={colors.text} />
            </Tool>
            <Tool label="Folder history" onPress={() => void openHistory()}>
              <History size={17} color={colors.text} />
            </Tool>
          </>
        }
      />
      <ContextSheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Folder history"
        subtitle={
          history.frequent.length || history.recent.length
            ? "Most used first, then recent"
            : "No folders yet"
        }
        actions={historyActions}
      />
    </View>
  );
}
