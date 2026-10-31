import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useActiveAccount } from "@/core/accounts";
import { useRepositories } from "@/core/data/hooks";
import { useTerminalCustomization } from "@/contexts/TerminalCustomizationContext";
import type { Snippet, SSHHost } from "@/types";
import { isSshActive } from "@/utils/hosts";
import { Button, Input, Label, Sheet, SheetBody, Text, useConfirm } from "@/ui";
import { HostPicker } from "./HostPicker";
import { inputsOf } from "./run";
import { accountBackend, runOnHosts, type HostRunResult } from "./run-hosts";
import { targetHosts } from "./targets";

const preview = (text: string) => {
  const lines = text.trim().split("\n");
  const shown = lines.slice(0, 6).join("\n");
  return lines.length > 6 ? `${shown}\n...` : shown;
};

/** Runs a snippet on several hosts without a terminal and shows each result. */
export function RunOnHostsSheet({
  snippet,
  onClose,
}: {
  snippet: Snippet | null;
  onClose: () => void;
}) {
  const repos = useRepositories();
  const account = useActiveAccount();
  const confirm = useConfirm();
  const { config } = useTerminalCustomization();
  const [hosts, setHosts] = useState<SSHHost[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [values, setValues] = useState<Record<string, string>>({});
  const [results, setResults] = useState<HostRunResult[]>([]);
  const [running, setRunning] = useState(false);
  const [picking, setPicking] = useState(false);
  const inputs = useMemo(() => (snippet ? inputsOf(snippet) : []), [snippet]);

  useEffect(() => {
    if (!snippet) return;
    setResults([]);
    setValues({});
    let live = true;
    repos.hosts
      .list()
      .then((list) => {
        if (!live) return;
        const usable = list.filter((h) => isSshActive(h) && !h.shared);
        setHosts(usable);
        setSelected(
          new Set(targetHosts(snippet, usable, account.kind).map((h) => h.id)),
        );
      })
      .catch(() => live && setHosts([]));
    return () => {
      live = false;
    };
  }, [snippet, repos, account.kind]);

  const chosen = hosts.filter((h) => selected.has(h.id));

  const run = async () => {
    if (!snippet || chosen.length === 0) return;
    if (config.confirmSnippetRun) {
      const ok = await confirm({
        title: `Run ${snippet.name} on ${chosen.length} ${chosen.length === 1 ? "host" : "hosts"}?`,
        confirmLabel: "Run",
        destructive: false,
      });
      if (!ok) return;
    }
    setRunning(true);
    setResults([]);
    try {
      await runOnHosts(accountBackend(account.id), snippet, chosen, {
        inputValues: values,
        onResult: (r) => setResults((prev) => [...prev, r]),
      });
    } finally {
      setRunning(false);
    }
  };

  const failed = results.filter((r) => !r.ok).length;

  return (
    <>
      <Sheet
        scroll
        visible={snippet !== null && !picking}
        onClose={running ? () => {} : onClose}
        title={snippet ? `Run "${snippet.name}"` : "Run"}
        description="Runs over SSH on each host. No terminal opens."
        footer={
          <View className="flex-row gap-2">
            <Button variant="muted" className="flex-1" onPress={onClose}>
              Close
            </Button>
            <Button
              className="flex-1"
              loading={running}
              disabled={chosen.length === 0}
              onPress={() => void run()}
            >
              Run
            </Button>
          </View>
        }
      >
        <SheetBody>
          <View className="gap-1">
            <Label>Hosts</Label>
            <Button variant="muted" onPress={() => setPicking(true)}>
              {chosen.length === 0
                ? "Pick hosts"
                : `${chosen.length} ${chosen.length === 1 ? "host" : "hosts"} picked`}
            </Button>
          </View>
          {inputs.map((input) => (
            <View key={input.key} className="gap-1">
              <Label>{input.label}</Label>
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                value={values[input.key] ?? ""}
                onChangeText={(t) =>
                  setValues((v) => ({ ...v, [input.key]: t }))
                }
              />
            </View>
          ))}
          {results.length > 0 ? (
            <View className="gap-2">
              <Text weight="medium" className="text-row text-foreground">
                {results.length - failed} worked, {failed} failed
              </Text>
              <ScrollView nestedScrollEnabled style={{ maxHeight: 320 }}>
                {results.map((r) => (
                  <View
                    key={r.host.id}
                    className="gap-1 border-b border-border/40 py-2"
                  >
                    <Text
                      weight="medium"
                      className={`text-row ${r.ok ? "text-foreground" : "text-destructive-text"}`}
                    >
                      {r.host.name || r.host.ip}
                      {r.via
                        ? ` | ${r.via === "phone" ? "phone" : "server"}`
                        : ""}
                    </Text>
                    {r.output.trim() ? (
                      <Text className="font-mono text-meta text-muted-foreground">
                        {preview(r.output)}
                      </Text>
                    ) : null}
                    {r.error ? (
                      <Text className="text-meta text-destructive-text">
                        {preview(r.error)}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </SheetBody>
      </Sheet>
      <HostPicker
        visible={picking}
        title="Run on"
        hosts={hosts}
        selected={selected}
        onChange={setSelected}
        onClose={() => setPicking(false)}
      />
    </>
  );
}
