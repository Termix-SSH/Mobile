import { shareTempFile } from "@/utils/share-file";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { useRepositories } from "@/core/data/hooks";
import { buildExport, withJumpHosts } from "@/core/hosts/transfer/termix-json";
import type { SSHHost } from "@/types";
import { toast } from "@/utils/toast";
import {
  Button,
  Checkbox,
  FakeSwitch,
  SettingRow,
  Sheet,
  Text,
  useConfirm,
  Section as UiSection,
} from "@/ui";
import { ImportPanel } from "./ImportPanel";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <UiSection title={title} bodyClassName="gap-2 px-3 py-3">
      {children}
    </UiSection>
  );
}

export default function HostTransfer() {
  const router = useRouter();
  const repos = useRepositories();
  const confirm = useConfirm();
  const [hosts, setHosts] = useState<SSHHost[]>([]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [everything, setEverything] = useState(true);
  const [secrets, setSecrets] = useState(false);

  const load = useCallback(async () => {
    setHosts(
      (await repos.hosts.list().catch(() => [])).filter((h) => !h.shared),
    );
  }, [repos]);

  useEffect(() => {
    void load();
    return repos.hosts.subscribe(() => void load());
  }, [load, repos]);

  const chosen = useMemo(() => {
    const all = everything ? hosts : hosts.filter((h) => picked.has(h.id));
    return withJumpHosts(all, hosts);
  }, [everything, hosts, picked]);

  const makeExport = async () => {
    if (secrets) {
      const ok = await confirm({
        title: t("hostTransfer.includePasswordsAndKeys"),
        description: t("hostTransfer.anyoneWhoGetsThisFile"),
        confirmLabel: t("hostTransfer.includeThem"),
      });
      if (!ok) return null;
    }
    const logins = await repos.credentials.list().catch(() => []);
    return JSON.stringify(
      buildExport(chosen, logins, { share: !secrets }),
      null,
      2,
    );
  };

  const shareFile = async () => {
    if (chosen.length === 0)
      return toast.error(t("hostTransfer.pickAtLeastOneHost"));
    setBusy(true);
    try {
      const content = await makeExport();
      if (!content) return;
      const day = new Date().toISOString().slice(0, 10);
      await shareTempFile(`termix-hosts-${day}.json`, content, {
        mimeType: "application/json",
        dialogTitle: t("hostTransfer.saveYourTermixHosts"),
      });
    } catch (e: any) {
      toast.error(e?.message || t("hostTransfer.couldNotMakeTheFile"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (chosen.length === 0)
      return toast.error(t("hostTransfer.pickAtLeastOneHost"));
    const content = await makeExport();
    if (!content) return;
    await Clipboard.setStringAsync(content);
    toast.success(t("hostTransfer.copiedToTheClipboard"));
  };

  return (
    <Screen
      title={t("hostTransfer.importAndExport")}
      subtitle={t("hostTransfer.moveHostsInAndOut")}
      onBack={() => router.back()}
    >
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Section title={t("hostTransfer.import")}>
          <Text className="text-meta text-muted-foreground">
            {t("hostTransfer.aTermixHostFileAn", { deviceWord })}
          </Text>
          <ImportPanel />
        </Section>

        <Section title={t("hostTransfer.export")}>
          <SettingRow
            label={t("hostTransfer.allHosts")}
            description={
              everything
                ? t("common.hostCount", { count: hosts.length })
                : t("hostTransfer.picked", { size: picked.size })
            }
          >
            <FakeSwitch
              checked={everything}
              onChange={setEverything}
              accessibilityLabel={t("hostTransfer.allHosts")}
            />
          </SettingRow>
          {!everything ? (
            <Button variant="muted" size="sm" onPress={() => setPicking(true)}>
              {t("hostTransfer.pickHosts")}
            </Button>
          ) : null}
          <SettingRow
            label={t("hostTransfer.includePasswordsAndKeys2")}
            description={t("hostTransfer.offMakesAFileSafe")}
            last
          >
            <FakeSwitch
              checked={secrets}
              onChange={setSecrets}
              accessibilityLabel={t("hostTransfer.includePasswordsAndKeys2")}
            />
          </SettingRow>
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" disabled={busy} onPress={() => void shareFile()}>
              {t("hostTransfer.shareAFile")}
            </Button>
            <Button
              variant="muted"
              size="sm"
              disabled={busy}
              onPress={() => void copy()}
            >
              {t("hostTransfer.copy")}
            </Button>
          </View>
        </Section>
      </ScrollView>

      <Sheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={t("hostTransfer.pickHosts")}
        scroll
      >
        {hosts.map((h) => (
          <Pressable
            key={h.id}
            onPress={() =>
              setPicked((prev) => {
                const next = new Set(prev);
                if (next.has(h.id)) next.delete(h.id);
                else next.add(h.id);
                return next;
              })
            }
            className="min-h-12 flex-row items-center gap-3 border-b border-border/40 px-4 py-3"
          >
            <Checkbox
              checked={picked.has(h.id)}
              onChange={() =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (next.has(h.id)) next.delete(h.id);
                  else next.add(h.id);
                  return next;
                })
              }
              accessibilityLabel={h.name || h.ip}
            />
            <View className="min-w-0 flex-1">
              <Text weight="medium" className="text-row text-foreground">
                {h.name || h.ip}
              </Text>
              <Text className="text-meta text-muted-foreground">
                {h.username ? `${h.username}@` : ""}
                {h.ip}:{h.port}
              </Text>
            </View>
          </Pressable>
        ))}
      </Sheet>
    </Screen>
  );
}
