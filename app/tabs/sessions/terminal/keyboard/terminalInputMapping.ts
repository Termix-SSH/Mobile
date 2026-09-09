export type TerminalInputSource = "native-ime" | "ios-keycommand";

export type TerminalInputModifiers = {
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
};

export type TerminalSpecialKeyEvent = TerminalInputModifiers & {
  key: string;
  source: TerminalInputSource;
};

export type TerminalSpecialKeyRecord = {
  signature: string;
  source: TerminalInputSource;
  timestamp: number;
};

const SPECIAL_KEY_MAP: Record<string, string> = {
  Enter: "\r",
  Backspace: "\x7f",
  Escape: "\x1b",
  Delete: "\x1b[3~",
  Home: "\x1b[H",
  End: "\x1b[F",
  PageUp: "\x1b[5~",
  PageDown: "\x1b[6~",
  ArrowUp: "\x1b[A",
  ArrowDown: "\x1b[B",
  ArrowRight: "\x1b[C",
  ArrowLeft: "\x1b[D",
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

const SHIFT_ARROW_MAP: Record<string, string> = {
  ArrowUp: "\x1b[1;2A",
  ArrowDown: "\x1b[1;2B",
  ArrowRight: "\x1b[1;2C",
  ArrowLeft: "\x1b[1;2D",
};

function normalizeKey(key: string) {
  return key === "\t" ? "Tab" : key;
}

function isAsciiPrintableCharacter(text: string) {
  if (text.length !== 1) {
    return false;
  }

  const codePoint = text.codePointAt(0);
  return codePoint !== undefined && codePoint >= 0x20 && codePoint <= 0x7e;
}

export function translateCommittedText(
  text: string,
  modifiers: TerminalInputModifiers,
): string {
  const ctrl = !!modifiers.ctrl;
  const alt = !!modifiers.alt;
  const shift = !!modifiers.shift;

  if (!ctrl && !alt && !shift) {
    return text;
  }

  if (!isAsciiPrintableCharacter(text)) {
    return text;
  }

  const shifted = shift ? text.toUpperCase() : text;

  if (ctrl) {
    return String.fromCharCode(shifted.toLowerCase().charCodeAt(0) & 0x1f);
  }

  if (alt) {
    return `\x1b${shifted}`;
  }

  return shifted;
}

export function translateSpecialKeyEvent(
  event: TerminalSpecialKeyEvent,
): string | null {
  const key = normalizeKey(event.key);
  const shift = !!event.shift;
  const ctrl = !!event.ctrl;
  const alt = !!event.alt;

  if (ctrl && key.length === 1) {
    return String.fromCharCode(key.toLowerCase().charCodeAt(0) & 0x1f);
  }

  if (alt && !ctrl && key.length === 1) {
    return `\x1b${shift ? key.toUpperCase() : key}`;
  }

  if (key === "Tab") {
    return shift ? "\x1b[Z" : "\t";
  }

  if (shift && SHIFT_ARROW_MAP[key]) {
    return SHIFT_ARROW_MAP[key];
  }

  return SPECIAL_KEY_MAP[key] || null;
}

export function makeTerminalSpecialKeyRecord(
  event: TerminalSpecialKeyEvent,
  timestamp: number = Date.now(),
): TerminalSpecialKeyRecord {
  const key = normalizeKey(event.key);
  return {
    signature: `${key}|${event.shift ? 1 : 0}|${event.ctrl ? 1 : 0}|${event.alt ? 1 : 0}`,
    source: event.source,
    timestamp,
  };
}

export function isDuplicateTerminalSpecialKey(
  previous: TerminalSpecialKeyRecord | null,
  event: TerminalSpecialKeyEvent,
  timestamp: number = Date.now(),
  windowMs: number = 40,
) {
  if (!previous) {
    return false;
  }

  const next = makeTerminalSpecialKeyRecord(event, timestamp);
  return (
    previous.signature === next.signature &&
    previous.source !== next.source &&
    timestamp - previous.timestamp < windowMs
  );
}
