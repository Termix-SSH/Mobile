import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useIncomingShare } from "expo-sharing";
import { File as FileIcon, Server } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useUiColors } from "@/contexts/ThemeContext";
import { useAccounts } from "@/core/accounts";
import { SessionAccountProvider } from "@/core/accounts/session";
import { accountLabel } from "@/core/accounts/types";
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
import { toSharedFiles, type SharedFile } from "./incoming";

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
        <EmptyState icon={Server} title="No SSH hosts here" />
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
  const router = useRouter();
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
        toast.error(toUserMessage(e, "Could not read what was shared"));
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
        title: "Stop the uploads?",
        description: `${running} ${running === 1 ? "upload is" : "uploads are"} still going. Leaving stops them.`,
        confirmLabel: "Stop and leave",
      }))
    ) {
      return;
    }
    share.clearSharedPayloads();
    router.replace("/(tabs)/hosts");
  };

  const back = () => {
    if (host && !sent) setHost(null);
    else void leave();
  };

  const subtitle = files
    ? `${files.length} ${files.length === 1 ? "file" : "files"} | ${formatFileSize(total)}`
    : "Reading what was shared";

  return (
    <Screen
      title={host ? `Send to ${host.name}` : "Send to a host"}
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
          title="Nothing to send"
          action={<Button onPress={() => void leave()}>Close</Button>}
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
                  {sent ? "Done" : "Cancel"}
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
                  Upload here
                </Button>
              </View>
            </View>
          )}
        </SessionAccountProvider>
      )}
    </Screen>
  );
}
