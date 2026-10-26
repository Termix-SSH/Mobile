import { shareTempFile } from "@/utils/share-file";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useRepositories } from "@/core/data/hooks";
import { buildExport, withJumpHosts } from "@/core/hosts/transfer/termix-json";
import type { SSHHost } from "@/types";
import { toast } from "@/utils/toast";
import {
  Button,
  Checkbox,
  FakeSwitch,
  Sheet,
  SettingRow,
  Text,
  useConfirm,
} from "@/ui";
import { ImportPanel } from "./ImportPanel";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="border border-border bg-card">
      <View className="border-b border-border px-3 py-3">
        <Text
          weight="bold"
          className="text-[11px] uppercase tracking-[2px] text-foreground"
        >
          {title}
        </Text>
      </View>
      <View className="gap-2 px-3 py-3">{children}</View>
    </View>
  );
}

export default function HostTransfer() {
  const router = useRouter();
  const color = useThemeColor();
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
        title: "Include passwords and keys?",
        description:
          "Anyone who gets this file can sign in to these hosts. Keep it safe.",
        confirmLabel: "Include them",
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
    if (chosen.length === 0) return toast.error("Pick at least one host");
    setBusy(true);
    try {
      const content = await makeExport();
      if (!content) return;
      const day = new Date().toISOString().slice(0, 10);
      await shareTempFile(`termix-hosts-${day}.json`, content, {
        mimeType: "application/json",
        dialogTitle: "Save your Termix hosts",
      });
    } catch (e: any) {
      toast.error(e?.message || "Could not make the file");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (chosen.length === 0) return toast.error("Pick at least one host");
    const content = await makeExport();
    if (!content) return;
    await Clipboard.setStringAsync(content);
    toast.success("Copied to the clipboard");
  };

  return (
    <Screen
      title="Import and export"
      subtitle="Move hosts in and out"
      headerLeft={
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Section title="Import">
          <Text className="text-meta text-muted-foreground">
            A Termix host file, an SSH config file, or a host link or QR code
            from another phone.
          </Text>
          <ImportPanel />
        </Section>

        <Section title="Export">
          <SettingRow
            label="All hosts"
            description={
              everything
                ? `${hosts.length} ${hosts.length === 1 ? "host" : "hosts"}`
                : `${picked.size} picked`
            }
          >
            <FakeSwitch
              checked={everything}
              onChange={setEverything}
              accessibilityLabel="All hosts"
            />
          </SettingRow>
          {!everything ? (
            <Button variant="muted" size="sm" onPress={() => setPicking(true)}>
              Pick hosts
            </Button>
          ) : null}
          <SettingRow
            label="Include passwords and keys"
            description="Off makes a file safe to share. Hosts that use a saved login point at it by name"
            last
          >
            <FakeSwitch
              checked={secrets}
              onChange={setSecrets}
              accessibilityLabel="Include passwords and keys"
            />
          </SettingRow>
          <View className="flex-row flex-wrap gap-2">
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
        </Section>
      </ScrollView>

      <Sheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Pick hosts"
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
