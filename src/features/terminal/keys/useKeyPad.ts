import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import * as Clipboard from "expo-clipboard";
import type {
  StickyModifierState,
  TerminalInputHandle,
} from "@/core/features/types";
import { runKeyAction, type KeySink } from "./dispatch";
import type { KeyDef, ModifierName } from "./model";

// Two taps on a modifier this close lock it.
const LOCK_MS = 400;

/** Sticky modifier steps: tap arms, a quick second tap locks, a tap unlocks. */
export function nextSticky(
  state: StickyModifierState,
  sinceLastTap: number,
): StickyModifierState {
  if (state === "inactive") return "armed";
  if (state === "armed" && sinceLastTap < LOCK_MS) return "locked";
  return "inactive";
}

export interface KeyPadOptions {
  tmuxPrefix: string;
  backspaceMode?: "normal" | "control-h";
  /** App actions other than paste, like "search" or "panel.snippets". */
  onCommand?: (id: string) => void;
}

/**
 * Key row state and presses for one terminal. The native terminal keeps
 * sticky Ctrl and Alt; Shift, and Ctrl and Alt on xterm, are kept here.
 */
export function useKeyPad(
  terminalRef: React.RefObject<TerminalInputHandle | null>,
  options: KeyPadOptions,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const target = useCallback(
    () => terminalRef.current?.keyTarget?.() ?? null,
    [terminalRef],
  );

  const subscribe = useCallback(
    (onChange: () => void) =>
      target()?.subscribeModifiers(onChange) ?? (() => {}),
    [target],
  );
  const nativeKey = useSyncExternalStore(subscribe, () => {
    const t = target();
    if (!t) return null;
    const m = t.modifiers();
    return `${m.ctrl}|${m.alt}`;
  });

  const [local, setLocal] = useState<Record<ModifierName, StickyModifierState>>(
    { ctrl: "inactive", alt: "inactive", shift: "inactive" },
  );
  const lastTap = useRef<Record<ModifierName, number>>({
    ctrl: 0,
    alt: 0,
    shift: 0,
  });

  const mods: Record<ModifierName, StickyModifierState> = nativeKey
    ? {
        ctrl: nativeKey.split("|")[0] as StickyModifierState,
        alt: nativeKey.split("|")[1] as StickyModifierState,
        shift: local.shift,
      }
    : local;

  const paste = useCallback(async () => {
    const text = await Clipboard.getStringAsync().catch(() => "");
    if (!text) return;
    const t = target();
    if (t) t.paste(text);
    else terminalRef.current?.sendInput(text);
  }, [target, terminalRef]);

  const press = useCallback(
    (key: KeyDef) => {
      const t = target();
      const sink: KeySink = {
        target: t,
        send: (data) => terminalRef.current?.sendInput(data),
        command: (id) => {
          if (id === "paste") void paste();
          else optionsRef.current.onCommand?.(id);
        },
      };
      const result = runKeyAction(key.action, sink, {
        shift: local.shift !== "inactive",
        ctrl: !t && local.ctrl !== "inactive",
        alt: !t && local.alt !== "inactive",
        tmuxPrefix: optionsRef.current.tmuxPrefix,
        backspaceMode: optionsRef.current.backspaceMode,
      });
      if (result.toggled) {
        const name = result.toggled;
        // The native view steps its own Ctrl and Alt.
        if (t && name !== "shift") return;
        const now = Date.now();
        const since = now - lastTap.current[name];
        lastTap.current[name] = now;
        setLocal((prev) => ({
          ...prev,
          [name]: nextSticky(prev[name], since),
        }));
        return;
      }
      if (result.consumed) {
        setLocal((prev) => ({
          ctrl: prev.ctrl === "armed" ? "inactive" : prev.ctrl,
          alt: prev.alt === "armed" ? "inactive" : prev.alt,
          shift: prev.shift === "armed" ? "inactive" : prev.shift,
        }));
      }
    },
    [local, paste, target, terminalRef],
  );

  return { press, mods };
}
