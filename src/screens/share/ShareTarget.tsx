import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useIncomingShare } from "expo-sharing";
import { File as FileIcon, Server } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useUiColors } from "@/contexts/ThemeContext";
import { useAccounts, accountLabel } from "@/core/accounts";
import { SessionAccountProvider } from "@/core/accounts/session";
import { useLiveList, useSessionRepositories } from "@/core/data/hooks";
import { toUserMessage } from "@/core/errors";
import {
  FileManager,
  type FileManagerHandle,
} from "@/features/file-manager/FileManager";
import { FILES_TAB_TYPE } from "@/features/file-manager/CompanionFiles";
import { formatFileSize } from "@/features/file-manager/utils/fileUtils";
import type { SSHHost } from "@/types";
import { Button, EmptyState, ListRow, Text, useConfirm } from "@/ui";
import { isSshHost } from "@/utils/hosts";
import { toast } from "@/utils/toast";
import { openTab } from "@/screens/shell/navigate";
import { toSharedFiles, type SharedFile } from "./incoming";
import { t } from "@/i18n";

function HostPicker({ onPick }: { onPick: (host: SSHHost) => void }) {
  const colors = useUiColors();
  const repos = useSessionRepositories();
  const hosts = useLiveList(repos.hosts, () => repos.hosts.list(), [repos]);
  const ssh = hosts.data.filter(isSshHost);
  if (hosts.loading && !ssh.length) {
    return <ActivityIndicator color={colors.textMuted} className="mt-6" />;
  }
  return (
    <FlatList
      data={ssh}
      keyExtractor={(h) => String(h.id)}
      ListEmptyComponent={
        <EmptyState
          icon={Server}
          title={t("share.shareTarget.noSshHostsHere")}
        />
      }
      renderItem={({ item, index }) => (
        <ListRow
          index={index}
          title={item.name || item.ip}
          meta={`${item.username}@${item.ip}:${item.port}`}
          icon={<Server size={15} color={colors.textMuted} />}
          onPress={() => onPick(item)}
        />
      )}
    />
  );
}

/** Where files other apps share with Termix land: pick a host and a folder, then upload. */
export default function ShareTarget() {
  const colors = useUiColors();
  const { accounts, active } = useAccounts();
  const share = useIncomingShare();
  const [files, setFiles] = useState<SharedFile[] | null>(null);
  const [accountId, setAccountId] = useState(active.id);
  const [host, setHost] = useState<SSHHost | null>(null);
  const [sent, setSent] = useState(false);
  const manager = useRef<FileManagerHandle>(null);
  const confirm = useConfirm();

  useEffect(() => {
    if (share.isResolving || files) return;
    if (!share.resolvedSharedPayloads.length) return;
    toSharedFiles(share.resolvedSharedPayloads)
      .then(setFiles)
      .catch((e) => {
        toast.error(
          toUserMessage(e, t("share.shareTarget.couldNotReadWhatWas")),
        );
        setFiles([]);
      });
  }, [share.isResolving, share.resolvedSharedPayloads, files]);

  const total = useMemo(
    () => (files ?? []).reduce((n, f) => n + (f.size ?? 0), 0),
    [files],
  );

  const leave = async () => {
    const running = manager.current?.activeTransfers() ?? 0;
    if (
      running > 0 &&
      !(await confirm({
        title: t("share.shareTarget.stopTheUploads"),
        description: t("share.shareTarget.uploadsStillGoing", {
          count: running,
        }),
        confirmLabel: t("share.shareTarget.stopAndLeave"),
      }))
    ) {
      return;
    }
    share.clearSharedPayloads();
    openTab("/(tabs)/hosts");
  };

  const back = () => {
    if (host && !sent) setHost(null);
    else void leave();
  };

  const subtitle = files
    ? t("share.shareTarget.filesSize", {
        count: files.length,
        size: formatFileSize(total),
      })
    : t("share.shareTarget.readingWhatWasShared");

  return (
    <Screen
      title={
        host
          ? t("share.shareTarget.sendTo", { name: host.name })
          : t("share.shareTarget.sendToAHost")
      }
      subtitle={subtitle}
      onBack={back}
    >
      {!files ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator color={colors.brand} />
          {share.error ? (
            <Text className="text-sm text-destructive-text">
              {toUserMessage(share.error)}
            </Text>
          ) : null}
        </View>
      ) : !files.length ? (
        <EmptyState
          icon={FileIcon}
          title={t("share.shareTarget.nothingToSend")}
          action={
            <Button onPress={() => void leave()}>
              {t("share.shareTarget.close")}
            </Button>
          }
        />
      ) : (
        <SessionAccountProvider accountId={accountId}>
          <View className="border-b border-border px-3 py-2">
            {files.slice(0, 3).map((f) => (
              <Text
                key={f.path}
                numberOfLines={1}
                className="text-meta text-muted-foreground"
              >
                {f.size != null
                  ? `${f.name} | ${formatFileSize(f.size)}`
                  : f.name}
              </Text>
            ))}
            {files.length > 3 ? (
              <Text className="text-meta text-muted-foreground">
                {`and ${files.length - 3} more`}
              </Text>
            ) : null}
          </View>
          {!host ? (
            <>
              {accounts.length > 1 ? (
                <View className="flex-row flex-wrap gap-1.5 border-b border-border p-2">
                  {accounts.map((a) => (
                    <Pressable
                      key={a.id}
                      onPress={() => setAccountId(a.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: a.id === accountId }}
                      className={`border px-3 py-2 ${a.id === accountId ? "border-accent-brand bg-accent-brand/10" : "border-border"}`}
                    >
                      <Text className="text-xs text-foreground">
                        {accountLabel(a)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <HostPicker key={accountId} onPick={setHost} />
            </>
          ) : (
            <View className="flex-1">
              <FileManager
                ref={manager}
                host={host}
                type={FILES_TAB_TYPE}
                isVisible
                onClose={() => setHost(null)}
              />
              <View className="flex-row gap-2 border-t border-border p-3">
                <Button
                  variant="muted"
                  className="flex-1"
                  onPress={() => void leave()}
                >
                  {sent
                    ? t("share.shareTarget.done")
                    : t("share.shareTarget.cancel")}
                </Button>
                <Button
                  className="flex-1"
                  disabled={sent}
                  onPress={() => {
                    manager.current?.uploadLocal(
                      files.map((f) => ({ path: f.path, name: f.name })),
                    );
                    setSent(true);
                  }}
                >
                  {t("share.shareTarget.uploadHere")}
                </Button>
              </View>
            </View>
          )}
        </SessionAccountProvider>
      )}
    </Screen>
  );
}
