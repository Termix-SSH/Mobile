import { shareTempFile } from "@/utils/share-file";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { File } from "expo-file-system";
import { ArrowLeft } from "lucide-react-native";
import { accountLabel, useActiveAccount } from "@/core/accounts";
import { useLocalStoreState, useRepositories } from "@/core/data/hooks";
import { BACKUP_EXTENSION, SCHEMA_VERSION, localStores } from "@/core/db";
import { toUserMessage } from "@/core/errors";
import { Button, PromptSheet, SettingRow, Text, useConfirm } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import { useRestoreBackup } from "./RestoreBackup";

type Step = { kind: "export" } | { kind: "export-again"; passphrase: string };

function formatSize(bytes: number | null): string {
  if (bytes == null) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function LocalData() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const confirm = useConfirm();
  const color = useThemeColor();
  const account = useActiveAccount();
  const repos = useRepositories();
  const { available } = useLocalStoreState();

  const [counts, setCounts] = useState({ hosts: 0, logins: 0, snippets: 0 });
  const [size, setSize] = useState<number | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!available) return;
    try {
      const { path } = await localStores.get(account.id);
      const [hosts, logins, snippets] = await Promise.all([
        repos.hosts.list(),
        repos.credentials.list(),
        repos.snippets.list(),
      ]);
      // A server that can't sync reads live, so count what is on this phone.
      setCounts(
        repos.source === "local"
          ? {
              hosts: hosts.length,
              logins: logins.length,
              snippets: snippets.length,
            }
          : { hosts: 0, logins: 0, snippets: 0 },
      );
      setSize(path ? new File(`file://${path}`).size : null);
    } catch {
      setSize(null);
    }
  }, [account.id, available, repos]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportBackup = async (passphrase: string) => {
    setBusy(true);
    try {
      const content = await localStores.exportBackup(account.id, passphrase);
      const day = new Date().toISOString().slice(0, 10);
      setStep(null);
      await shareTempFile(`termix-${day}.${BACKUP_EXTENSION}`, content, {
        mimeType: "application/json",
        dialogTitle: "Save your Termix backup",
      });
    } catch (error) {
      toast.error(toUserMessage(error, "Could not make the backup"));
    } finally {
      setBusy(false);
    }
  };

  const restore = useRestoreBackup({
    accountId: account.id,
    accountName: accountLabel(account),
    onDone: () => void load(),
  });

  const deleteAll = async () => {
    const ok = await confirm({
      title: "Delete local data?",
      description: `Hosts, logins, snippets and history saved on this phone for ${accountLabel(account)} are deleted. This can't be undone. Make a backup first if you want to keep them.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await localStores.wipe(account.id);
      toast.success("Local data deleted");
      void load();
    } catch (error) {
      toast.error(toUserMessage(error, "Could not delete local data"));
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={8}
        >
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
        <Text weight="bold" className="flex-1 text-base text-foreground">
          Local data
        </Text>
      </View>

      {!available ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-sm text-muted-foreground">
            Local data is only saved in the phone app.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text className="mb-3 text-[11px] text-muted-foreground">
            Saved on this phone for {accountLabel(account)}. The file is
            encrypted with a key that never leaves this phone.
          </Text>

          <View className="border border-border bg-card px-3">
            <SettingRow label="Hosts">
              <Text className="text-sm text-muted-foreground">
                {counts.hosts}
              </Text>
            </SettingRow>
            <SettingRow label="Logins">
              <Text className="text-sm text-muted-foreground">
                {counts.logins}
              </Text>
            </SettingRow>
            <SettingRow label="Snippets">
              <Text className="text-sm text-muted-foreground">
                {counts.snippets}
              </Text>
            </SettingRow>
            <SettingRow label="Size">
              <Text className="text-sm text-muted-foreground">
                {formatSize(size)}
              </Text>
            </SettingRow>
            <SettingRow label="Data version" last>
              <Text className="text-sm text-muted-foreground">
                {SCHEMA_VERSION}
              </Text>
            </SettingRow>
          </View>

          <Text weight="medium" className="mb-1 mt-6 text-sm text-foreground">
            Backup
          </Text>
          <Text className="mb-3 text-[11px] text-muted-foreground">
            A backup file holds your passwords and keys, locked with a
            passphrase you choose. Nobody can open it without that passphrase.
          </Text>
          <View className="gap-2">
            <Button onPress={() => setStep({ kind: "export" })}>
              Export backup
            </Button>
            <Button variant="muted" onPress={() => void restore.start()}>
              Import backup
            </Button>
          </View>

          <Text weight="medium" className="mb-1 mt-6 text-sm text-foreground">
            Delete
          </Text>
          <Text className="mb-3 text-[11px] text-muted-foreground">
            Removes everything this account saved on this phone. A linked server
            keeps its own copy.
          </Text>
          <Button variant="destructive" onPress={deleteAll}>
            Delete local data
          </Button>
        </ScrollView>
      )}

      <PromptSheet
        visible={step?.kind === "export"}
        title="Backup passphrase"
        description="At least 8 characters. You need it to restore the backup."
        placeholder="Passphrase"
        confirmLabel="Next"
        secureTextEntry
        validate={(value) => value.length >= 8}
        onSubmit={(passphrase) => setStep({ kind: "export-again", passphrase })}
        onCancel={() => setStep(null)}
      />
      <PromptSheet
        visible={step?.kind === "export-again"}
        title="Type it again"
        placeholder="Passphrase"
        confirmLabel="Export"
        secureTextEntry
        loading={busy}
        validate={(value) =>
          step?.kind === "export-again" && value === step.passphrase
        }
        onSubmit={(passphrase) => void exportBackup(passphrase)}
        onCancel={() => setStep(null)}
      />
      {restore.sheet}
    </View>
  );
}
