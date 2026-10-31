import {
  newId,
  type KeyAction,
  type KeyDef,
  type KeyGroup,
  type KeyLayout,
  type KeyRow,
} from "./model";

export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

export function setRows(layout: KeyLayout, rows: KeyRow[]): KeyLayout {
  return { ...layout, rows };
}

export function updateRow(
  layout: KeyLayout,
  rowId: string,
  fn: (row: KeyRow) => KeyRow | null,
): KeyLayout {
  const rows: KeyRow[] = [];
  for (const row of layout.rows) {
    if (row.id !== rowId) {
      rows.push(row);
      continue;
    }
    const next = fn(row);
    if (next) rows.push(next);
  }
  return { ...layout, rows };
}

export function updateGroup(
  layout: KeyLayout,
  rowId: string,
  groupId: string,
  fn: (group: KeyGroup) => KeyGroup | null,
): KeyLayout {
  return updateRow(layout, rowId, (row) => {
    const groups: KeyGroup[] = [];
    for (const group of row.groups) {
      if (group.id !== groupId) {
        groups.push(group);
        continue;
      }
      const next = fn(group);
      if (next) groups.push(next);
    }
    return { ...row, groups };
  });
}

export function addRow(layout: KeyLayout, label: string): KeyLayout {
  const row: KeyRow = {
    id: newId("row"),
    label: label.trim() || "Row",
    groups: [{ id: newId("group"), label: "Keys", keys: [] }],
  };
  return { ...layout, rows: [...layout.rows, row] };
}

export function addGroup(
  layout: KeyLayout,
  rowId: string,
  label: string,
): KeyLayout {
  return updateRow(layout, rowId, (row) => ({
    ...row,
    groups: [
      ...row.groups,
      { id: newId("group"), label: label.trim() || "Keys", keys: [] },
    ],
  }));
}

export function addKey(
  layout: KeyLayout,
  rowId: string,
  groupId: string,
  key: KeyDef,
): KeyLayout {
  return updateGroup(layout, rowId, groupId, (group) => ({
    ...group,
    keys: [...group.keys, { ...key }],
  }));
}

export type CustomKind = "text" | "ctrl" | "command";

/** A key the user made: text to type, or Ctrl plus a letter. */
export function customKey(
  label: string,
  kind: CustomKind,
  value: string,
): KeyDef | null {
  const name = label.trim();
  if (kind === "ctrl") {
    const ch = value.trim().slice(0, 1).toLowerCase();
    if (!ch) return null;
    return {
      id: newId("key"),
      label: name || `^${ch.toUpperCase()}`,
      action: { type: "ctrl", char: ch },
    };
  }
  if (!value) return null;
  // A command line runs: the text and Enter.
  const action: KeyAction =
    kind === "command"
      ? { type: "raw", data: `${value}\r` }
      : { type: "text", text: value };
  return { id: newId("key"), label: name || value.slice(0, 8), action };
}

/** Short words for what a key does, for the editor. */
export function describeAction(action: KeyAction): string {
  switch (action.type) {
    case "key":
      return `Key ${action.name}`;
    case "text":
      return `Types ${JSON.stringify(action.text)}`;
    case "ctrl":
      return `Ctrl+${action.char.toUpperCase()}`;
    case "raw":
      return action.data.endsWith("\r")
        ? `Runs ${JSON.stringify(action.data.slice(0, -1))}`
        : "Sends a key code";
    case "modifier":
      return "Sticky modifier";
    case "tmux":
      return `tmux prefix, then ${action.key ?? JSON.stringify(action.text ?? "")}`;
    case "command":
      return "App action";
  }
}
