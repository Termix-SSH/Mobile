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
import { t } from "@/i18n";

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
      toast.error(e?.message || t("hostTransfer.importPanel.couldNotReadThat"));
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
      toast.error(t("hostTransfer.importPanel.couldNotReadThatFile"));
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
      toast.error(e?.message || t("hostTransfer.importPanel.importFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        <Button variant="muted" onPress={() => void chooseFile()}>
          {t("hostTransfer.importPanel.chooseAFile")}
        </Button>
        <Button
          variant="muted"
          onPress={async () => read(await Clipboard.getStringAsync())}
        >
          {t("hostTransfer.importPanel.paste")}
        </Button>
        {canScanQr ? (
          <Button variant="muted" onPress={() => setScanning(true)}>
            {t("hostTransfer.importPanel.scanACode")}
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
              {t("hostTransfer.importPanel.couldNotBeRead", {
                count: source.file.errors.length,
              })}
            </Text>
          ) : null}
          <SettingRow
            label={t("hostTransfer.importPanel.updateHostsThatExist")}
            description={t("hostTransfer.importPanel.sameAddressPortAndUser")}
            last
          >
            <FakeSwitch
              checked={overwrite}
              onChange={setOverwrite}
              accessibilityLabel={t(
                "hostTransfer.importPanel.updateHostsThatExist",
              )}
            />
          </SettingRow>
          <View className="flex-row justify-end gap-2">
            <Button variant="ghost" onPress={() => setSource(null)}>
              {t("hostTransfer.importPanel.cancel")}
            </Button>
            <Button
              disabled={busy}
              loading={busy}
              onPress={() => void doImport()}
            >
              {t("hostTransfer.importPanel.import")}
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
              {t("hostTransfer.importPanel.andMore", {
                value: result.errors.length - 8,
              })}
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
