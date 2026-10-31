import type { TerminalKeyTarget } from "@/core/features/types";
import type { KeyAction } from "./model";

/** What a key press reaches. */
export interface KeySink {
  /** The native terminal, which keeps sticky Ctrl and Alt. Null on xterm. */
  target: TerminalKeyTarget | null;
  /** Bytes straight to the host. */
  send: (data: string) => void;
  /** App actions like paste. */
  command: (id: string) => void;
}

export interface KeyState {
  /** Sticky Shift, kept by the key row. */
  shift: boolean;
  /** Sticky Ctrl and Alt for a terminal without its own (xterm). */
  ctrl: boolean;
  alt: boolean;
  tmuxPrefix: string;
  backspaceMode?: "normal" | "control-h";
}

const SEQUENCES: Record<string, string> = {
  Escape: "\x1b",
  Tab: "\t",
  Enter: "\r",
  Backspace: "\x7f",
  Delete: "\x1b[3~",
  Insert: "\x1b[2~",
  ArrowUp: "\x1b[A",
  ArrowDown: "\x1b[B",
  ArrowRight: "\x1b[C",
  ArrowLeft: "\x1b[D",
  Home: "\x1b[H",
  End: "\x1b[F",
  PageUp: "\x1b[5~",
  PageDown: "\x1b[6~",
  F1: "\x1bOP",
  F2: "\x1bOQ",
  F3: "\x1bOR",
  F4: "\x1bOS",
  F5: "\x1b[15~",
  F6: "\x1b[17~",
  F7: "\x1b[18~",
  F8: "\x1b[19~",
  F9: "\x1b[20~",
  F10: "\x1b[21~",
  F11: "\x1b[23~",
  F12: "\x1b[24~",
};

/** The bytes for a named key, for terminals that don't encode keys. */
export function keySequence(name: string, shift = false): string | null {
  if (name === "Tab" && shift) return "\x1b[Z";
  return SEQUENCES[name] ?? null;
}

/** Ctrl plus a key as its control code: a..z, and @ [ \ ] ^ _ ? */
export function controlCode(char: string): string {
  const c = char.toLowerCase();
  if (c >= "a" && c <= "z") return String.fromCharCode(c.charCodeAt(0) - 96);
  const special: Record<string, number> = {
    "@": 0,
    " ": 0,
    "[": 27,
    "\\": 28,
    "]": 29,
    "^": 30,
    _: 31,
    "?": 127,
  };
  return c in special ? String.fromCharCode(special[c]) : char;
}

/** Text with sticky Ctrl, Alt and Shift applied, for terminals without them. */
function withModifiers(text: string, state: KeyState): string {
  let out = state.shift ? text.toUpperCase() : text;
  if (state.ctrl && [...out].length === 1) out = controlCode(out);
  if (state.alt) out = `\x1b${out}`;
  return out;
}

export interface KeyResult {
  /** The press used the sticky modifiers, so they can be released. */
  consumed: boolean;
  /** A modifier key was tapped. */
  toggled?: "ctrl" | "alt" | "shift";
}

/** Runs one key's action. */
export function runKeyAction(
  action: KeyAction,
  sink: KeySink,
  state: KeyState,
): KeyResult {
  const { target } = sink;
  switch (action.type) {
    case "modifier":
      if (target && action.name !== "shift") {
        target.toggleModifier(action.name);
      }
      return { consumed: false, toggled: action.name };
    case "key": {
      if (action.name === "Backspace" && state.backspaceMode === "control-h") {
        sink.send("\x08");
        return { consumed: true };
      }
      if (target) {
        target.sendKey(action.name, state.shift);
        return { consumed: true };
      }
      const seq = keySequence(action.name, state.shift);
      if (seq) sink.send(state.alt ? `\x1b${seq}` : seq);
      return { consumed: true };
    }
    case "text":
      if (target) {
        target.typeText(state.shift ? action.text.toUpperCase() : action.text);
      } else {
        sink.send(withModifiers(action.text, state));
      }
      return { consumed: true };
    case "ctrl":
      sink.send(controlCode(action.char));
      return { consumed: true };
    case "raw":
      sink.send(action.data);
      return { consumed: true };
    case "tmux": {
      let data = controlCode(state.tmuxPrefix || "b");
      if (action.key) data += keySequence(action.key) ?? "";
      else if (action.text) data += action.text;
      sink.send(data);
      return { consumed: true };
    }
    case "command":
      sink.command(action.id);
      return { consumed: false };
  }
}
