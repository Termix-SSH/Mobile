// Hardware keys to X11 keysyms, which VNC sends as they are and the engine
// turns into RDP scancodes.
import type { DisplayKeyEvent } from "@/modules/termix-display";

const F1 = 0xffbe;

/** Android key names (KeyEvent without the KEYCODE_ prefix). */
const ANDROID: Record<string, number> = {
  ENTER: 0xff0d,
  NUMPAD_ENTER: 0xff0d,
  DEL: 0xff08,
  FORWARD_DEL: 0xffff,
  TAB: 0xff09,
  ESCAPE: 0xff1b,
  DPAD_LEFT: 0xff51,
  DPAD_UP: 0xff52,
  DPAD_RIGHT: 0xff53,
  DPAD_DOWN: 0xff54,
  MOVE_HOME: 0xff50,
  MOVE_END: 0xff57,
  PAGE_UP: 0xff55,
  PAGE_DOWN: 0xff56,
  INSERT: 0xff63,
  SHIFT_LEFT: 0xffe1,
  SHIFT_RIGHT: 0xffe2,
  CTRL_LEFT: 0xffe3,
  CTRL_RIGHT: 0xffe4,
  ALT_LEFT: 0xffe9,
  ALT_RIGHT: 0xffea,
  META_LEFT: 0xffeb,
  META_RIGHT: 0xffec,
  CAPS_LOCK: 0xffe5,
  SPACE: 0x20,
};

/** iOS HID usages for keys that type no character. */
const IOS: Record<number, number> = {
  0x28: 0xff0d,
  0x58: 0xff0d,
  0x2a: 0xff08,
  0x4c: 0xffff,
  0x2b: 0xff09,
  0x29: 0xff1b,
  0x50: 0xff51,
  0x52: 0xff52,
  0x4f: 0xff53,
  0x51: 0xff54,
  0x4a: 0xff50,
  0x4d: 0xff57,
  0x4b: 0xff55,
  0x4e: 0xff56,
  0x49: 0xff63,
  0xe0: 0xffe3,
  0xe1: 0xffe1,
  0xe2: 0xffe9,
  0xe3: 0xffeb,
  0xe4: 0xffe4,
  0xe5: 0xffe2,
  0xe6: 0xffea,
  0xe7: 0xffec,
  0x39: 0xffe5,
  0x2c: 0x20,
};

/** A typed character as a keysym: Latin-1 as is, the rest in the Unicode range. */
export function keysymForChar(cp: number): number {
  if (cp === 0x0a || cp === 0x0d) return 0xff0d;
  if (cp === 0x08) return 0xff08;
  if (cp === 0x09) return 0xff09;
  if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) return cp;
  return 0x01000000 | cp;
}

export function keysymFor(e: DisplayKeyEvent): number | null {
  if (typeof e.code === "number") {
    if (IOS[e.code] != null) return IOS[e.code];
    if (e.code >= 0x3a && e.code <= 0x45) return F1 + (e.code - 0x3a);
    const ch = e.key.codePointAt(0);
    return ch != null && ch >= 0x20 ? keysymForChar(ch) : null;
  }
  if (ANDROID[e.key] != null) return ANDROID[e.key];
  const f = /^F(\d{1,2})$/.exec(e.key);
  if (f && Number(f[1]) >= 1 && Number(f[1]) <= 12) {
    return F1 + Number(f[1]) - 1;
  }
  const ch = typeof e.char === "number" ? e.char : e.char.codePointAt(0);
  return ch ? keysymForChar(ch) : null;
}
