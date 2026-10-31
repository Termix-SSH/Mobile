import {
  controlCode,
  keySequence,
  runKeyAction,
  type KeySink,
  type KeyState,
} from "@/features/terminal/keys/dispatch";
import type { TerminalKeyTarget } from "@/core/features/types";

function sink(native: boolean) {
  const sent: string[] = [];
  const calls: unknown[][] = [];
  const commands: string[] = [];
  const target = native
    ? ({
        sendKey: (...a: unknown[]) => calls.push(["sendKey", ...a]),
        typeText: (...a: unknown[]) => calls.push(["typeText", ...a]),
        toggleModifier: (...a: unknown[]) => calls.push(["toggle", ...a]),
      } as unknown as TerminalKeyTarget)
    : null;
  const s: KeySink = {
    target,
    send: (d) => sent.push(d),
    command: (id) => commands.push(id),
  };
  return { s, sent, calls, commands };
}

const state = (patch: Partial<KeyState> = {}): KeyState => ({
  shift: false,
  ctrl: false,
  alt: false,
  tmuxPrefix: "b",
  ...patch,
});

test("named keys go through the native view, with Shift", () => {
  const n = sink(true);
  runKeyAction({ type: "key", name: "Tab" }, n.s, state({ shift: true }));
  expect(n.calls).toEqual([["sendKey", "Tab", true]]);
});

test("without a native view keys are sent as sequences, Alt adds Escape", () => {
  const x = sink(false);
  runKeyAction({ type: "key", name: "ArrowUp" }, x.s, state());
  runKeyAction({ type: "key", name: "Tab" }, x.s, state({ shift: true }));
  runKeyAction({ type: "key", name: "End" }, x.s, state({ alt: true }));
  expect(x.sent).toEqual(["\x1b[A", "\x1b[Z", "\x1b\x1b[F"]);
});

test("Backspace sends ^H when the host asks for it", () => {
  const n = sink(true);
  runKeyAction(
    { type: "key", name: "Backspace" },
    n.s,
    state({ backspaceMode: "control-h" }),
  );
  expect(n.sent).toEqual(["\x08"]);
  expect(n.calls).toEqual([]);
});

test("text goes through the native view so its sticky keys apply", () => {
  const n = sink(true);
  runKeyAction({ type: "text", text: "a" }, n.s, state({ shift: true }));
  expect(n.calls).toEqual([["typeText", "A"]]);
  const x = sink(false);
  runKeyAction({ type: "text", text: "c" }, x.s, state({ ctrl: true }));
  runKeyAction({ type: "text", text: "f" }, x.s, state({ alt: true }));
  expect(x.sent).toEqual(["\x03", "\x1bf"]);
});

test("tmux keys send the prefix first", () => {
  const x = sink(true);
  runKeyAction({ type: "tmux", text: "%" }, x.s, state());
  runKeyAction(
    { type: "tmux", key: "ArrowLeft" },
    x.s,
    state({ tmuxPrefix: "a" }),
  );
  runKeyAction({ type: "tmux", text: "" }, x.s, state());
  expect(x.sent).toEqual(["\x02%", "\x01\x1b[D", "\x02"]);
});

test("modifiers toggle the native one, Shift is left to the row", () => {
  const n = sink(true);
  expect(
    runKeyAction({ type: "modifier", name: "ctrl" }, n.s, state()),
  ).toEqual({ consumed: false, toggled: "ctrl" });
  runKeyAction({ type: "modifier", name: "shift" }, n.s, state());
  expect(n.calls).toEqual([["toggle", "ctrl"]]);
});

test("commands, raw bytes and Ctrl keys", () => {
  const n = sink(true);
  runKeyAction({ type: "command", id: "search" }, n.s, state());
  runKeyAction({ type: "raw", data: "htop\r" }, n.s, state());
  runKeyAction({ type: "ctrl", char: "r" }, n.s, state());
  expect(n.commands).toEqual(["search"]);
  expect(n.sent).toEqual(["htop\r", "\x12"]);
});

test("control codes and sequences", () => {
  expect(controlCode("A")).toBe("\x01");
  expect(controlCode("[")).toBe("\x1b");
  expect(controlCode(" ")).toBe("\x00");
  expect(controlCode("1")).toBe("1");
  expect(keySequence("F5")).toBe("\x1b[15~");
  expect(keySequence("Nope")).toBeNull();
});
