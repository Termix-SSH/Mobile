import { useCallback, useState } from "react";
import { View } from "react-native";
import { Button, Input, Label, Sheet, SheetBody, useConfirm } from "@/ui";
import { useTerminalCustomization } from "@/contexts/TerminalCustomizationContext";
import type { TerminalInputHandle } from "@/core/features/types";
import type { Snippet, SSHHost } from "@/types";
import { showToast } from "@/utils/toast";
import {
  hostContext,
  inputsOf,
  resolveSnippet,
  sendToTerminal,
  snippetMode,
  type SnippetMode,
} from "./run";
import type { SnippetInput } from "./variables";

interface Pending {
  snippet: Snippet;
  mode: SnippetMode;
  inputs: SnippetInput[];
}

/**
 * Runs or inserts snippets into a terminal: asks for $INPUT_n values and,
 * when the user turned it on, confirms before running. Render `sheet`.
 */
export function useSnippetRunner(
  getTerminal: () => TerminalInputHandle | null | undefined,
  host?: SSHHost | null,
) {
  const confirm = useConfirm();
  const { config } = useTerminalCustomization();
  const [pending, setPending] = useState<Pending | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const confirmRun = !!config.confirmSnippetRun;

  const send = useCallback(
    async (
      snippet: Snippet,
      mode: SnippetMode,
      inputValues: Record<string, string> = {},
    ) => {
      if (mode === "run" && confirmRun) {
        const ok = await confirm({
          title: `Run ${snippet.name}?`,
          confirmLabel: "Run",
          destructive: false,
        });
        if (!ok) return;
      }
      const text = resolveSnippet(snippet, hostContext(host), inputValues);
      if (!sendToTerminal(getTerminal(), text, mode)) {
        showToast.error("No terminal is open");
      }
    },
    [confirm, confirmRun, getTerminal, host],
  );

  const start = useCallback(
    (snippet: Snippet, mode: SnippetMode = snippetMode(snippet)) => {
      const inputs = inputsOf(snippet);
      if (inputs.length === 0) {
        void send(snippet, mode);
        return;
      }
      setValues({});
      setPending({ snippet, mode, inputs });
    },
    [send],
  );

  const close = () => setPending(null);
  const submit = () => {
    if (!pending) return;
    const { snippet, mode } = pending;
    const filled = { ...values };
    setPending(null);
    void send(snippet, mode, filled);
  };

  const sheet = (
    <Sheet
      visible={pending !== null}
      onClose={close}
      title={pending?.snippet.name}
      description="Fill in the values for this snippet."
      footer={
        <View className="flex-row gap-2">
          <Button variant="muted" className="flex-1" onPress={close}>
            Cancel
          </Button>
          <Button className="flex-1" onPress={submit}>
            {pending?.mode === "insert" ? "Insert" : "Run"}
          </Button>
        </View>
      }
    >
      <SheetBody>
        {pending?.inputs.map((input, i) => (
          <View key={input.key} className="gap-1.5">
            <Label>{input.label}</Label>
            <Input
              autoFocus={i === 0}
              autoCapitalize="none"
              autoCorrect={false}
              value={values[input.key] ?? ""}
              onChangeText={(t) => setValues((v) => ({ ...v, [input.key]: t }))}
              onSubmitEditing={
                i === pending.inputs.length - 1 ? submit : undefined
              }
            />
          </View>
        ))}
      </SheetBody>
    </Sheet>
  );

  return { start, sheet };
}
