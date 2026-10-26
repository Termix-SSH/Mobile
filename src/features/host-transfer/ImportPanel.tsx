import { useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { Button, FakeSwitch, SettingRow, Text } from "@/ui";
import { useRepositories } from "@/core/data/hooks";
import { importSummary, type ImportResult } from "@/core/hosts/transfer/import";
import { readLocalText } from "@/utils/localFile";
import { toast } from "@/utils/toast";
import {
  describeSource,
  readImportText,
  runImport,
  type ImportSource,
} from "./read";
import { canScanQr } from "@/core/distribution";
import { ScanSheet } from "./ScanSheet";

/**
 * Brings hosts in from a Termix file, an SSH config, or a host link or QR
 * code from another phone. Used by Settings and the welcome screen.
 */
export function ImportPanel({
  onImported,
}: {
  onImported?: (result: ImportResult) => void;
}) {
  const repos = useRepositories();
  const [source, setSource] = useState<ImportSource | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  const read = (text: string) => {
    try {
      setSource(readImportText(text));
      setResult(null);
    } catch (e: any) {
      setSource(null);
      toast.error(e?.message || "Could not read that");
    }
  };

  const chooseFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ["application/json", "text/plain", "*/*"],
      });
      if (res.canceled || !res.assets?.[0]) return;
      read(await readLocalText(res.assets[0].uri));
    } catch {
      toast.error("Could not read that file");
    }
  };

  const doImport = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const res = await runImport(repos, source, { overwrite });
      setResult(res);
      setSource(null);
      if (res.created + res.updated > 0) toast.success(importSummary(res));
      onImported?.(res);
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        <Button variant="muted" onPress={() => void chooseFile()}>
          Choose a file
        </Button>
        <Button
          variant="muted"
          onPress={async () => read(await Clipboard.getStringAsync())}
        >
          Paste
        </Button>
        {canScanQr ? (
          <Button variant="muted" onPress={() => setScanning(true)}>
            Scan a code
          </Button>
        ) : null}
      </View>
      {source ? (
        <View className="gap-2 border border-border bg-muted/30 p-3">
          <Text weight="medium" className="text-row text-foreground">
            {describeSource(source)}
          </Text>
          {source.kind !== "link" && source.file.errors.length > 0 ? (
            <Text className="text-meta text-warning-text">
              {source.file.errors.length} could not be read
            </Text>
          ) : null}
          <SettingRow
            label="Update hosts that exist"
            description="Same address, port and user. Otherwise they are skipped"
            last
          >
            <FakeSwitch
              checked={overwrite}
              onChange={setOverwrite}
              accessibilityLabel="Update hosts that exist"
            />
          </SettingRow>
          <View className="flex-row justify-end gap-2">
            <Button variant="ghost" onPress={() => setSource(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              loading={busy}
              onPress={() => void doImport()}
            >
              Import
            </Button>
          </View>
        </View>
      ) : null}
      {result ? (
        <View className="gap-1 border border-border p-3">
          <Text weight="medium" className="text-row text-foreground">
            {importSummary(result)}
          </Text>
          {result.errors.slice(0, 8).map((error, i) => (
            <Text key={i} className="text-meta text-muted-foreground">
              {error}
            </Text>
          ))}
          {result.errors.length > 8 ? (
            <Text className="text-meta text-muted-foreground">
              and {result.errors.length - 8} more
            </Text>
          ) : null}
        </View>
      ) : null}
      {canScanQr ? (
        <ScanSheet
          visible={scanning}
          onClose={() => setScanning(false)}
          onScanned={(text) => {
            setScanning(false);
            read(text);
          }}
        />
      ) : null}
    </View>
  );
}
