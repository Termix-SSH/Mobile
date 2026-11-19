import { shareTempFile } from "@/utils/share-file";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { File } from "expo-file-system";
import { accountLabel, useActiveAccount } from "@/core/accounts";
import { useLocalStoreState, useRepositories } from "@/core/data/hooks";
import { BACKUP_EXTENSION, SCHEMA_VERSION, localStores } from "@/core/db";
import { toUserMessage } from "@/core/errors";
import { Button, PromptSheet, SettingRow, Text, useConfirm } from "@/ui";
import { toast } from "@/utils/toast";
import { useRestoreBackup } from "./RestoreBackup";
import { Screen } from "@/components/Screen";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

type Step = { kind: "export" } | { kind: "export-again"; passphrase: string };

function formatSize(bytes: number | null): string {
  if (bytes == null) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function LocalData() {
  const router = useRouter();
  const confirm = useConfirm();
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
        dialogTitle: t("settings.localData.saveYourTermixBackup"),
      });
    } catch (error) {
      toast.error(
        toUserMessage(error, t("settings.localData.couldNotMakeTheBackup")),
      );
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
      title: t("settings.localData.deleteLocalData"),
      description: t("settings.localData.hostsCredentialsSnippetsAndHistory", {
        deviceWord,
        account: accountLabel(account),
      }),
      confirmLabel: t("settings.localData.delete"),
    });
    if (!ok) return;
    try {
      await localStores.wipe(account.id);
      toast.success(t("settings.localData.localDataDeleted"));
      void load();
    } catch (error) {
      toast.error(
        toUserMessage(error, t("settings.localData.couldNotDeleteLocalData")),
      );
    }
  };

  return (
    <Screen
      title={t("settings.localData.localData")}
      onBack={() => router.back()}
    >
      {!available ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-sm text-muted-foreground">
            {t("settings.localData.localDataIsOnlySaved", { deviceWord })}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          <Text className="mb-3 text-[11px] text-muted-foreground">
            {t("settings.localData.savedOnThisForThe", {
              deviceWord,
              account: accountLabel(account),
            })}
          </Text>

          <View className="border border-border bg-card px-3">
            <SettingRow label={t("settings.localData.hosts")}>
              <Text className="text-sm text-muted-foreground">
                {counts.hosts}
              </Text>
            </SettingRow>
            <SettingRow label={t("settings.localData.credentials")}>
              <Text className="text-sm text-muted-foreground">
                {counts.logins}
              </Text>
            </SettingRow>
            <SettingRow label={t("settings.localData.snippets")}>
              <Text className="text-sm text-muted-foreground">
                {counts.snippets}
              </Text>
            </SettingRow>
            <SettingRow label={t("settings.localData.size")}>
              <Text className="text-sm text-muted-foreground">
                {formatSize(size)}
              </Text>
            </SettingRow>
            <SettingRow label={t("settings.localData.dataVersion")} last>
              <Text className="text-sm text-muted-foreground">
                {SCHEMA_VERSION}
              </Text>
            </SettingRow>
          </View>

          <Text weight="medium" className="mb-1 mt-6 text-sm text-foreground">
            {t("settings.localData.backup")}
          </Text>
          <Text className="mb-3 text-[11px] text-muted-foreground">
            {t("settings.localData.aBackupFileHoldsYour")}
          </Text>
          <View className="gap-2">
            <Button onPress={() => setStep({ kind: "export" })}>
              {t("settings.localData.exportBackup")}
            </Button>
            <Button variant="muted" onPress={() => void restore.start()}>
              {t("settings.localData.importBackup")}
            </Button>
          </View>

          <Text weight="medium" className="mb-1 mt-6 text-sm text-foreground">
            {t("settings.localData.delete")}
          </Text>
          <Text className="mb-3 text-[11px] text-muted-foreground">
            {t("settings.localData.removesEverythingThisAccountSaved", {
              deviceWord,
            })}
          </Text>
          <Button variant="destructive" onPress={deleteAll}>
            {t("settings.localData.deleteLocalData2")}
          </Button>
        </ScrollView>
      )}

      <PromptSheet
        visible={step?.kind === "export"}
        title={t("settings.localData.backupPassphrase")}
        description={t("settings.localData.atLeast8CharactersYou")}
        placeholder={t("settings.localData.passphrase")}
        confirmLabel={t("settings.localData.next")}
        secureTextEntry
        validate={(value) => value.length >= 8}
        onSubmit={(passphrase) => setStep({ kind: "export-again", passphrase })}
        onCancel={() => setStep(null)}
      />
      <PromptSheet
        visible={step?.kind === "export-again"}
        title={t("settings.localData.typeItAgain")}
        placeholder={t("settings.localData.passphrase")}
        confirmLabel={t("settings.localData.export")}
        secureTextEntry
        loading={busy}
        validate={(value) =>
          step?.kind === "export-again" && value === step.passphrase
        }
        onSubmit={(passphrase) => void exportBackup(passphrase)}
        onCancel={() => setStep(null)}
      />
      {restore.sheet}
    </Screen>
  );
}
