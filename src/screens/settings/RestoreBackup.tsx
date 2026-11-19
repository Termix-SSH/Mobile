import { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { localStores } from "@/core/db";
import { toUserMessage } from "@/core/errors";
import { PromptSheet, useConfirm } from "@/ui";
import { toast } from "@/utils/toast";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

/**
 * Picks a passphrase locked backup and restores it into one account's data.
 * `start` opens the file picker; render `sheet` once.
 */
export function useRestoreBackup({
  accountId,
  accountName,
  askFirst = true,
  onDone,
}: {
  accountId: string;
  accountName: string;
  /** Ask before replacing data. Off when there is nothing to lose. */
  askFirst?: boolean;
  onDone?: () => void;
}) {
  const confirm = useConfirm();
  const [content, setContent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const picked = new File(result.assets[0].uri);
      const text = await picked.text();
      try {
        picked.delete();
      } catch {}
      const ok =
        !askFirst ||
        (await confirm({
          title: t("settings.restoreBackup.replaceLocalData"),
          description: t("settings.restoreBackup.everythingSavedOnThisFor", {
            deviceWord,
            accountName,
          }),
          confirmLabel: t("settings.restoreBackup.continue"),
        }));
      if (ok) setContent(text);
    } catch {
      toast.error(t("settings.restoreBackup.couldNotReadThatFile"));
    }
  };

  const restore = async (passphrase: string) => {
    if (!content) return;
    setBusy(true);
    try {
      await localStores.importBackup(accountId, content, passphrase);
      setContent(null);
      toast.success(t("settings.restoreBackup.backupRestored"));
      onDone?.();
    } catch (error) {
      toast.error(
        toUserMessage(
          error,
          t("settings.restoreBackup.couldNotRestoreTheBackup"),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const sheet = (
    <PromptSheet
      visible={content !== null}
      title={t("settings.restoreBackup.backupPassphrase")}
      description={t("settings.restoreBackup.thePassphraseUsedWhenThe")}
      placeholder={t("settings.restoreBackup.passphrase")}
      confirmLabel={t("settings.restoreBackup.restore")}
      secureTextEntry
      loading={busy}
      onSubmit={(passphrase) => void restore(passphrase)}
      onCancel={() => setContent(null)}
    />
  );

  return { start, sheet, busy };
}
