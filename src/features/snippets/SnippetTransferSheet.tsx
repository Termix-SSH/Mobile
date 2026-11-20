import { shareTempFile } from "@/utils/share-file";
import { useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { useRepositories } from "@/core/data/hooks";
import { readLocalText } from "@/utils/localFile";
import { toast } from "@/utils/toast";
import { Button, FakeSwitch, SettingRow, Sheet, SheetBody, Text } from "@/ui";
import {
  buildSnippetExport,
  importSnippetFile,
  parseSnippetFile,
  snippetImportSummary,
  type SnippetImportResult,
} from "./transfer";
import { t } from "@/i18n";

/** Import and export the snippets of the active account as a JSON file. */
export function SnippetTransferSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const repos = useRepositories();
  const [overwrite, setOverwrite] = useState(false);
  const [result, setResult] = useState<SnippetImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const exportText = async () => {
    const [snippets, folders] = await Promise.all([
      repos.snippets.list(),
      repos.snippetFolders.list(),
    ]);
    if (snippets.length === 0 && folders.length === 0) {
      toast.error(t("snippets.snippetTransferSheet.thereAreNoSnippetsTo"));
      return null;
    }
    return JSON.stringify(buildSnippetExport(snippets, folders), null, 2);
  };

  const shareFile = async () => {
    setBusy(true);
    try {
      const text = await exportText();
      if (!text) return;
      const day = new Date().toISOString().slice(0, 10);
      await shareTempFile(`termix-snippets-${day}.json`, text, {
        mimeType: "application/json",
        dialogTitle: t("snippets.snippetTransferSheet.saveYourSnippets"),
      });
    } catch (e: any) {
      toast.error(
        e?.message || t("snippets.snippetTransferSheet.couldNotMakeTheFile"),
      );
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const text = await exportText();
    if (!text) return;
    await Clipboard.setStringAsync(text);
    toast.success(t("snippets.snippetTransferSheet.copiedToTheClipboard"));
  };

  const importText = async (text: string) => {
    setBusy(true);
    try {
      const res = await importSnippetFile(repos, parseSnippetFile(text), {
        overwrite,
      });
      setResult(res);
      if (res.imported + res.updated > 0) {
        toast.success(snippetImportSummary(res));
      }
    } catch (e: any) {
      toast.error(
        e?.message || t("snippets.snippetTransferSheet.couldNotImport"),
      );
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ["application/json", "text/plain", "*/*"],
      });
      if (res.canceled || !res.assets?.[0]) return;
      await importText(await readLocalText(res.assets[0].uri));
    } catch {
      toast.error(t("snippets.snippetTransferSheet.couldNotReadThatFile"));
    }
  };

  return (
    <Sheet
      scroll
      visible={visible}
      onClose={() => {
        setResult(null);
        onClose();
      }}
      title={t("snippets.snippetTransferSheet.importAndExport")}
      description={t("snippets.snippetTransferSheet.theSameFileTheWeb")}
    >
      <SheetBody>
        <Text weight="medium" className="text-row text-foreground">
          {t("snippets.snippetTransferSheet.export")}
        </Text>
        <View className="flex-row gap-2">
          <Button size="sm" disabled={busy} onPress={() => void shareFile()}>
            {t("snippets.snippetTransferSheet.shareAFile")}
          </Button>
          <Button
            variant="muted"
            size="sm"
            disabled={busy}
            onPress={() => void copy()}
          >
            {t("snippets.snippetTransferSheet.copy")}
          </Button>
        </View>
        <Text weight="medium" className="mt-2 text-row text-foreground">
          {t("snippets.snippetTransferSheet.import")}
        </Text>
        <SettingRow
          label={t("snippets.snippetTransferSheet.updateSnippetsThatExist")}
          description={t("snippets.snippetTransferSheet.sameNameInTheSame")}
          last
        >
          <FakeSwitch
            checked={overwrite}
            onChange={setOverwrite}
            accessibilityLabel={t(
              "snippets.snippetTransferSheet.updateSnippetsThatExist",
            )}
          />
        </SettingRow>
        <View className="flex-row gap-2">
          <Button
            variant="muted"
            size="sm"
            disabled={busy}
            onPress={() => void chooseFile()}
          >
            {t("snippets.snippetTransferSheet.chooseAFile")}
          </Button>
          <Button
            variant="muted"
            size="sm"
            disabled={busy}
            onPress={async () =>
              void importText(await Clipboard.getStringAsync())
            }
          >
            {t("snippets.snippetTransferSheet.paste")}
          </Button>
        </View>
        {result ? (
          <View className="gap-1 border border-border p-3">
            <Text weight="medium" className="text-row text-foreground">
              {snippetImportSummary(result)}
            </Text>
            {result.errors.slice(0, 6).map((error, i) => (
              <Text key={i} className="text-meta text-muted-foreground">
                {error}
              </Text>
            ))}
          </View>
        ) : null}
      </SheetBody>
    </Sheet>
  );
}
