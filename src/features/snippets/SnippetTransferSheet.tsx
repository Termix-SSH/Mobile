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
      toast.error("There are no snippets to export");
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
        dialogTitle: "Save your snippets",
      });
    } catch (e: any) {
      toast.error(e?.message || "Could not make the file");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const text = await exportText();
    if (!text) return;
    await Clipboard.setStringAsync(text);
    toast.success("Copied to the clipboard");
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
      toast.error(e?.message || "Could not import");
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
      toast.error("Could not read that file");
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
      title="Import and export"
      description="The same file the web app uses."
    >
      <SheetBody>
        <Text weight="medium" className="text-row text-foreground">
          Export
        </Text>
        <View className="flex-row gap-2">
          <Button size="sm" disabled={busy} onPress={() => void shareFile()}>
            Share a file
          </Button>
          <Button
            variant="muted"
            size="sm"
            disabled={busy}
            onPress={() => void copy()}
          >
            Copy
          </Button>
        </View>
        <Text weight="medium" className="mt-2 text-row text-foreground">
          Import
        </Text>
        <SettingRow
          label="Update snippets that exist"
          description="Same name in the same folder. Otherwise they are skipped"
          last
        >
          <FakeSwitch
            checked={overwrite}
            onChange={setOverwrite}
            accessibilityLabel="Update snippets that exist"
          />
        </SettingRow>
        <View className="flex-row gap-2">
          <Button
            variant="muted"
            size="sm"
            disabled={busy}
            onPress={() => void chooseFile()}
          >
            Choose a file
          </Button>
          <Button
            variant="muted"
            size="sm"
            disabled={busy}
            onPress={async () =>
              void importText(await Clipboard.getStringAsync())
            }
          >
            Paste
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
