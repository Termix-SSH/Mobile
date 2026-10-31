import { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { localStores } from "@/core/db";
import { toUserMessage } from "@/core/errors";
import { PromptSheet, useConfirm } from "@/ui";
import { toast } from "@/utils/toast";

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
          title: "Replace local data?",
          description: `Everything saved on this phone for ${accountName} is replaced with the backup.`,
          confirmLabel: "Continue",
        }));
      if (ok) setContent(text);
    } catch {
      toast.error("Could not read that file");
    }
  };

  const restore = async (passphrase: string) => {
    if (!content) return;
    setBusy(true);
    try {
      await localStores.importBackup(accountId, content, passphrase);
      setContent(null);
      toast.success("Backup restored");
      onDone?.();
    } catch (error) {
      toast.error(toUserMessage(error, "Could not restore the backup"));
    } finally {
      setBusy(false);
    }
  };

  const sheet = (
    <PromptSheet
      visible={content !== null}
      title="Backup passphrase"
      description="The passphrase used when the backup was made."
      placeholder="Passphrase"
      confirmLabel="Restore"
      secureTextEntry
      loading={busy}
      onSubmit={(passphrase) => void restore(passphrase)}
      onCancel={() => setContent(null)}
    />
  );

  return { start, sheet, busy };
}
