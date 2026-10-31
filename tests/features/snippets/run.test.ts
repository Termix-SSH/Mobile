import {
  hostContext,
  inputsOf,
  resolveSnippet,
  sendToTerminal,
  snippetMode,
} from "@/features/snippets/run";
import type { TerminalInputHandle } from "@/core/features/types";
import type { SSHHost } from "@/types";

function terminal(withTarget: boolean) {
  const sent: string[] = [];
  const pasted: string[] = [];
  const handle = {
    sendInput: (d: string) => sent.push(d),
    keyTarget: () =>
      withTarget ? ({ paste: (t: string) => pasted.push(t) } as never) : null,
  } as unknown as TerminalInputHandle;
  return { handle, sent, pasted };
}

test("notes insert, commands run unless told not to", () => {
  expect(snippetMode({ isNote: true })).toBe("insert");
  expect(snippetMode({ isNote: false })).toBe("run");
  expect(snippetMode({}, false)).toBe("insert");
});

test("run types the text and Enter", () => {
  const t = terminal(true);
  expect(sendToTerminal(t.handle, "ls", "run")).toBe(true);
  expect(t.sent).toEqual(["ls\r"]);
  expect(t.pasted).toEqual([]);
});

test("insert pastes through the native view, or types without Enter", () => {
  const native = terminal(true);
  sendToTerminal(native.handle, "rm -rf x", "insert");
  expect(native.pasted).toEqual(["rm -rf x"]);
  expect(native.sent).toEqual([]);
  const fallback = terminal(false);
  sendToTerminal(fallback.handle, "rm -rf x", "insert");
  expect(fallback.sent).toEqual(["rm -rf x"]);
});

test("no terminal sends nothing", () => {
  expect(sendToTerminal(null, "ls", "run")).toBe(false);
});

test("resolves with the host's address and the given inputs", () => {
  const ctx = hostContext({
    ip: "1.2.3.4",
    username: "u",
    port: 2200,
    name: "box",
  } as SSHHost);
  expect(
    resolveSnippet({ content: "ping $HOST $INPUT_1" }, ctx, {
      INPUT_1: "-c 1",
    }),
  ).toBe("ping 1.2.3.4 -c 1");
  expect(hostContext(null)).toBeNull();
  expect(inputsOf({ content: "x ${INPUT_1:Count}" })).toEqual([
    { key: "INPUT_1", label: "Count" },
  ]);
});
