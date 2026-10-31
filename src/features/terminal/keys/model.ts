/**
 * Key rows above the keyboard and in the keys panel. A layout is rows of
 * groups of keys; a key does one action. The global layout is the app's,
 * a host can have its own.
 */

export type ModifierName = "ctrl" | "alt" | "shift";

export type KeyAction =
  /** A named key the terminal encodes, like Escape or ArrowUp. */
  | { type: "key"; name: string }
  /** Text typed as if on the keyboard, so sticky Ctrl and Alt apply. */
  | { type: "text"; text: string }
  /** Ctrl plus a letter or symbol, as its control code. */
  | { type: "ctrl"; char: string }
  /** Bytes sent as they are. */
  | { type: "raw"; data: string }
  | { type: "modifier"; name: ModifierName }
  /** The tmux prefix, then text or a named key. */
  | { type: "tmux"; text?: string; key?: string }
  /** Something the app does, like paste or open the tmux window list. */
  | { type: "command"; id: string };

export interface KeyDef {
  id: string;
  label: string;
  action: KeyAction;
  /** Shown on long press. */
  variants?: KeyDef[];
}

export interface KeyGroup {
  id: string;
  label: string;
  keys: KeyDef[];
}

export interface KeyRow {
  id: string;
  label: string;
  groups: KeyGroup[];
}

export interface KeyLayout {
  version: 1;
  rows: KeyRow[];
  /** The letter of the tmux prefix, Ctrl plus this. */
  tmuxPrefix: string;
}

export const LAYOUT_VERSION = 1;

const named = (id: string, label: string, name: string): KeyDef => ({
  id,
  label,
  action: { type: "key", name },
});
const text = (id: string, label: string, value = label): KeyDef => ({
  id,
  label,
  action: { type: "text", text: value },
});
const ctrl = (char: string): KeyDef => ({
  id: `ctrl${char.toUpperCase()}`,
  label: `^${char.toUpperCase()}`,
  action: { type: "ctrl", char },
});
const mod = (name: ModifierName, label: string): KeyDef => ({
  id: name,
  label,
  action: { type: "modifier", name },
});
const tmux = (
  id: string,
  label: string,
  then: string,
  key = false,
): KeyDef => ({
  id,
  label,
  action: key ? { type: "tmux", key: then } : { type: "tmux", text: then },
});
const command = (id: string, label: string, commandId: string): KeyDef => ({
  id,
  label,
  action: { type: "command", id: commandId },
});
const withVariants = (key: KeyDef, variants: KeyDef[]): KeyDef => ({
  ...key,
  variants,
});

const F_KEYS = Array.from({ length: 12 }, (_, i) =>
  named(`f${i + 1}`, `F${i + 1}`, `F${i + 1}`),
);

const SYMBOLS: [string, string][] = [
  ["tilde", "~"],
  ["backtick", "`"],
  ["exclamation", "!"],
  ["at", "@"],
  ["hash", "#"],
  ["dollar", "$"],
  ["percent", "%"],
  ["caret", "^"],
  ["ampersand", "&"],
  ["asterisk", "*"],
  ["minus", "-"],
  ["underscore", "_"],
  ["equals", "="],
  ["plus", "+"],
  ["pipe", "|"],
  ["backslash", "\\"],
  ["slash", "/"],
  ["question", "?"],
  ["parenLeft", "("],
  ["parenRight", ")"],
  ["bracketLeft", "["],
  ["bracketRight", "]"],
  ["braceLeft", "{"],
  ["braceRight", "}"],
  ["angleBracketLeft", "<"],
  ["angleBracketRight", ">"],
  ["semicolon", ";"],
  ["colon", ":"],
  ["singleQuote", "'"],
  ["doubleQuote", '"'],
  ["comma", ","],
  ["period", "."],
];

/** Every key the editor offers, by id. */
export const KEY_PALETTE: Record<string, KeyDef> = Object.fromEntries(
  (
    [
      named("escape", "Esc", "Escape"),
      named("tab", "Tab", "Tab"),
      {
        id: "shiftTab",
        label: "S-Tab",
        action: { type: "raw", data: "\x1b[Z" },
      },
      named("enter", "Enter", "Enter"),
      named("backspace", "Bksp", "Backspace"),
      named("delete", "Del", "Delete"),
      named("insert", "Ins", "Insert"),
      mod("ctrl", "Ctrl"),
      mod("alt", "Alt"),
      mod("shift", "Shift"),
      named("arrowUp", "↑", "ArrowUp"),
      named("arrowDown", "↓", "ArrowDown"),
      named("arrowLeft", "←", "ArrowLeft"),
      named("arrowRight", "→", "ArrowRight"),
      named("home", "Home", "Home"),
      named("end", "End", "End"),
      named("pageUp", "PgUp", "PageUp"),
      named("pageDown", "PgDn", "PageDown"),
      ...F_KEYS,
      ...SYMBOLS.map(([id, ch]) => text(id, ch)),
      text("space", "Space", " "),
      ...[..."cdzlaekuwrytnpbf"].map(ctrl),
      { id: "clear", label: "Clear", action: { type: "ctrl", char: "l" } },
      { id: "altF", label: "M-f", action: { type: "raw", data: "\x1bf" } },
      { id: "altB", label: "M-b", action: { type: "raw", data: "\x1bb" } },
      { id: "altD", label: "M-d", action: { type: "raw", data: "\x1bd" } },
      command("paste", "Paste", "paste"),
      command("snippets", "{ }", "panel.snippets"),
      command("history", "Hist", "panel.history"),
      command("search", "Find", "search"),
      tmux("tmuxPrefix", "Prefix", ""),
      tmux("tmuxSplitH", "Split ─", '"'),
      tmux("tmuxSplitV", "Split │", "%"),
      tmux("tmuxNew", "New win", "c"),
      tmux("tmuxPrev", "Prev win", "p"),
      tmux("tmuxNext", "Next win", "n"),
      command("tmuxWindows", "Windows", "tmux.windows"),
      tmux("tmuxRename", "Rename", ","),
      tmux("tmuxPaneLeft", "Pane ←", "ArrowLeft", true),
      tmux("tmuxPaneDown", "Pane ↓", "ArrowDown", true),
      tmux("tmuxPaneUp", "Pane ↑", "ArrowUp", true),
      tmux("tmuxPaneRight", "Pane →", "ArrowRight", true),
      tmux("tmuxZoom", "Zoom", "z"),
      tmux("tmuxCopy", "Copy mode", "["),
      tmux("tmuxPasteBuffer", "Paste buf", "]"),
      tmux("tmuxKillPane", "Kill pane", "x"),
      tmux("tmuxDetach", "Detach", "d"),
    ] as KeyDef[]
  ).map((k) => [k.id, k]),
);

const k = (id: string) => KEY_PALETTE[id];

/** Long press options for the keys that have them. */
// Arrows repeat while held, so they have none.
const VARIANTS: Record<string, string[]> = {
  minus: ["underscore", "equals", "plus"],
  pipe: ["backslash", "ampersand"],
  slash: ["backslash", "question"],
  tilde: ["backtick", "caret"],
  tab: ["shiftTab"],
  escape: ["ctrlC", "ctrlD", "ctrlZ"],
  dollar: ["hash", "percent", "at"],
};

/** A palette key with its long press options. */
export function paletteKey(id: string): KeyDef | null {
  const key = KEY_PALETTE[id];
  if (!key) return null;
  const variants = (VARIANTS[id] ?? []).map(k).filter(Boolean);
  return variants.length ? withVariants(key, variants) : key;
}

const keys = (...ids: string[]) =>
  ids.map(paletteKey).filter((x): x is KeyDef => x !== null);

export function defaultLayout(): KeyLayout {
  return {
    version: LAYOUT_VERSION,
    tmuxPrefix: "b",
    rows: [
      {
        id: "main",
        label: "Main",
        groups: [
          {
            id: "mods",
            label: "Keys",
            keys: keys("escape", "tab", "ctrl", "alt"),
          },
          {
            id: "arrows",
            label: "Arrows",
            keys: keys("arrowLeft", "arrowDown", "arrowUp", "arrowRight"),
          },
          {
            id: "symbols",
            label: "Symbols",
            keys: keys("pipe", "tilde", "slash", "minus", "dollar"),
          },
          {
            id: "actions",
            label: "Actions",
            keys: keys("paste", "search", "snippets"),
          },
        ],
      },
      {
        id: "nav",
        label: "Nav",
        groups: [
          {
            id: "move",
            label: "Move",
            keys: keys("home", "end", "pageUp", "pageDown", "insert", "delete"),
          },
          {
            id: "fn",
            label: "Function",
            keys: keys(...F_KEYS.map((f) => f.id)),
          },
        ],
      },
      {
        id: "symbols",
        label: "Symbols",
        groups: [
          {
            id: "brackets",
            label: "Brackets",
            keys: keys(
              "parenLeft",
              "parenRight",
              "bracketLeft",
              "bracketRight",
              "braceLeft",
              "braceRight",
              "angleBracketLeft",
              "angleBracketRight",
            ),
          },
          {
            id: "punct",
            label: "Punctuation",
            keys: keys(
              "backtick",
              "singleQuote",
              "doubleQuote",
              "semicolon",
              "colon",
              "exclamation",
              "at",
              "hash",
              "ampersand",
              "asterisk",
              "equals",
              "plus",
              "backslash",
            ),
          },
        ],
      },
      {
        id: "ctrl",
        label: "Ctrl",
        groups: [
          {
            id: "control",
            label: "Control",
            keys: keys(
              "ctrlC",
              "ctrlD",
              "ctrlZ",
              "ctrlL",
              "ctrlR",
              "ctrlA",
              "ctrlE",
              "ctrlW",
              "ctrlU",
              "ctrlK",
            ),
          },
        ],
      },
      {
        id: "tmux",
        label: "tmux",
        groups: [
          {
            id: "tmuxWindows",
            label: "Windows",
            keys: keys(
              "tmuxPrefix",
              "tmuxNew",
              "tmuxPrev",
              "tmuxNext",
              "tmuxWindows",
              "tmuxRename",
            ),
          },
          {
            id: "tmuxPanes",
            label: "Panes",
            keys: keys(
              "tmuxSplitH",
              "tmuxSplitV",
              "tmuxPaneLeft",
              "tmuxPaneDown",
              "tmuxPaneUp",
              "tmuxPaneRight",
              "tmuxZoom",
              "tmuxKillPane",
            ),
          },
          {
            id: "tmuxCopy",
            label: "Copy",
            keys: keys("tmuxCopy", "tmuxPasteBuffer", "tmuxDetach"),
          },
        ],
      },
    ],
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function readAction(v: unknown): KeyAction | null {
  if (!isObject(v) || typeof v.type !== "string") return null;
  const str = (x: unknown) => (typeof x === "string" ? x : null);
  switch (v.type) {
    case "key":
      return str(v.name) ? { type: "key", name: v.name as string } : null;
    case "text":
      return str(v.text) ? { type: "text", text: v.text as string } : null;
    case "ctrl":
      return str(v.char) && (v.char as string).length === 1
        ? { type: "ctrl", char: v.char as string }
        : null;
    case "raw":
      return str(v.data) ? { type: "raw", data: v.data as string } : null;
    case "modifier":
      return v.name === "ctrl" || v.name === "alt" || v.name === "shift"
        ? { type: "modifier", name: v.name }
        : null;
    case "tmux":
      return {
        type: "tmux",
        ...(str(v.text) !== null ? { text: v.text as string } : {}),
        ...(str(v.key) ? { key: v.key as string } : {}),
      };
    case "command":
      return str(v.id) ? { type: "command", id: v.id as string } : null;
    default:
      return null;
  }
}

function readKey(v: unknown, depth = 0): KeyDef | null {
  if (!isObject(v) || typeof v.id !== "string") return null;
  const action = readAction(v.action);
  if (!action) return null;
  const label = typeof v.label === "string" && v.label ? v.label : v.id;
  const variants =
    depth === 0 && Array.isArray(v.variants)
      ? v.variants
          .map((x) => readKey(x, 1))
          .filter((x): x is KeyDef => x !== null)
      : [];
  return { id: v.id, label, action, ...(variants.length ? { variants } : {}) };
}

/** A saved layout, checked, or null when it can't be read. */
export function readLayout(value: unknown): KeyLayout | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!isObject(parsed) || !Array.isArray(parsed.rows)) return null;
  const rows: KeyRow[] = [];
  for (const row of parsed.rows) {
    if (!isObject(row) || typeof row.id !== "string") continue;
    const groups: KeyGroup[] = [];
    for (const group of Array.isArray(row.groups) ? row.groups : []) {
      if (!isObject(group) || typeof group.id !== "string") continue;
      groups.push({
        id: group.id,
        label: typeof group.label === "string" ? group.label : "",
        keys: (Array.isArray(group.keys) ? group.keys : [])
          .map((x) => readKey(x))
          .filter((x): x is KeyDef => x !== null),
      });
    }
    rows.push({
      id: row.id,
      label: typeof row.label === "string" ? row.label : row.id,
      groups,
    });
  }
  const prefix =
    typeof parsed.tmuxPrefix === "string" && /^[a-z]$/.test(parsed.tmuxPrefix)
      ? parsed.tmuxPrefix
      : "b";
  return rows.length
    ? { version: LAYOUT_VERSION, rows, tmuxPrefix: prefix }
    : null;
}

interface LegacyKey {
  id?: unknown;
  label?: unknown;
  value?: unknown;
}

function legacyKey(v: LegacyKey): KeyDef | null {
  if (typeof v?.id !== "string") return null;
  const known = paletteKey(v.id);
  if (known) return known;
  if (typeof v.value !== "string" || !v.value) return null;
  return {
    id: v.id,
    label: typeof v.label === "string" ? v.label : v.id,
    action: { type: "raw", data: v.value },
  };
}

/**
 * The 1.x key bar and keyboard rows as a layout: the bar's keys become the
 * first row, each keyboard row a row of one group. Null when nothing is saved.
 */
export function migrateLegacy(value: unknown): KeyLayout | null {
  if (!isObject(value)) return null;
  const top = isObject(value.topBar) ? value.topBar : {};
  const barKeys = [
    ...(Array.isArray(top.pinnedKeys) ? top.pinnedKeys : []),
    ...(Array.isArray(top.keys) ? top.keys : []),
  ]
    .map((x) => legacyKey(x as LegacyKey))
    .filter((x): x is KeyDef => x !== null);
  const full = isObject(value.fullKeyboard) ? value.fullKeyboard : {};
  const rows: KeyRow[] = [];
  if (barKeys.length) {
    rows.push({
      id: "main",
      label: "Main",
      groups: [{ id: "bar", label: "Keys", keys: barKeys }],
    });
  }
  for (const row of Array.isArray(full.rows) ? full.rows : []) {
    if (!isObject(row) || row.visible === false) continue;
    const keys = (Array.isArray(row.keys) ? row.keys : [])
      .map((x) => legacyKey(x as LegacyKey))
      .filter((x): x is KeyDef => x !== null);
    if (!keys.length) continue;
    const id = typeof row.id === "string" ? row.id : `row${rows.length}`;
    const label = typeof row.label === "string" ? row.label : id;
    rows.push({ id, label, groups: [{ id: `${id}-keys`, label, keys }] });
  }
  if (!rows.length) return null;
  // The tmux row is new; add it so people find it.
  const tmuxRow = defaultLayout().rows.find((r) => r.id === "tmux")!;
  if (!rows.some((r) => r.id === "tmux")) rows.push(tmuxRow);
  return { version: LAYOUT_VERSION, rows, tmuxPrefix: "b" };
}

/** A new id for a key, group or row, unique within the layout. */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
