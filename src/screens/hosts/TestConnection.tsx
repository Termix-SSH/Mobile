import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { CheckCircle2, PlugZap, XCircle } from "lucide-react-native";
import { Button, Text, useConfirm } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useRepositories } from "@/core/data/hooks";
import { failureTitle } from "@/core/transport/errors";
import {
  testOnDevice,
  type TestResult,
  type TestTarget,
} from "@/core/transport/test";

/**
 * A Test connection button and its result. `getTarget` builds the login from
 * the form, or returns a message when the form isn't ready.
 */
export function TestConnection({
  getTarget,
  note,
}: {
  getTarget: () => Promise<TestTarget | string>;
  /** A line under the button, like where the test runs from. */
  note?: string;
}) {
  const color = useThemeColor();
  const confirm = useConfirm();
  const repos = useRepositories();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<
    TestResult | { ok: false; text: string }
  >();
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(async () => {
    if (running) {
      abort.current?.abort();
      return;
    }
    setResult(undefined);
    const target = await getTarget();
    if (typeof target === "string") {
      setResult({ ok: false, text: target });
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    try {
      const outcome = await testOnDevice(repos.connect, target, {
        signal: controller.signal,
        askHostKey: (scenario, data) =>
          confirm({
            title:
              scenario === "changed"
                ? "This host's key changed"
                : "Trust this host?",
            description: `${data.ip}:${data.port}\n${data.keyType} ${data.fingerprint}`,
            confirmLabel: "Trust",
            destructive: scenario === "changed",
          }),
      });
      if (!controller.signal.aborted) setResult(outcome);
    } finally {
      setRunning(false);
      abort.current = null;
    }
  }, [running, getTarget, repos.connect, confirm]);

  const ok = result?.ok === true;
  return (
    <View className="gap-2">
      <Button
        variant="outline"
        onPress={run}
        icon={<PlugZap size={14} color={color("foreground")} />}
      >
        {running ? "Stop test" : "Test connection"}
      </Button>
      {running ? (
        <Text className="text-meta text-muted-foreground">Connecting...</Text>
      ) : null}
      {result ? (
        <View
          className={`flex-row gap-2 border p-2.5 ${ok ? "border-green-500/40 bg-green-500/10" : "border-destructive/40 bg-destructive/10"}`}
          accessibilityLiveRegion="polite"
        >
          {ok ? (
            <CheckCircle2 size={16} color={color("success")} />
          ) : (
            <XCircle size={16} color={color("destructive")} />
          )}
          <View className="min-w-0 flex-1 gap-0.5">
            {"text" in result ? (
              <Text className="text-meta text-foreground">{result.text}</Text>
            ) : result.ok ? (
              <>
                <Text weight="medium" className="text-meta text-foreground">
                  {result.message}
                </Text>
                <Text className="text-[10px] text-muted-foreground">
                  {result.fingerprint}
                </Text>
              </>
            ) : (
              <>
                <Text weight="medium" className="text-meta text-foreground">
                  {failureTitle(result.failure.stage)}
                </Text>
                <Text className="text-meta text-muted-foreground">
                  {result.failure.message}
                </Text>
                <Text className="text-meta text-muted-foreground">
                  {result.failure.hint}
                </Text>
              </>
            )}
          </View>
        </View>
      ) : null}
      {note ? (
        <Text className="text-meta text-muted-foreground">{note}</Text>
      ) : null}
    </View>
  );
}
