/**
 * A plugin's `contributes.settings.host` from its manifest: the fields the
 * web host editor draws for it. The app draws the simple ones the same way
 * when it has no screen of its own for that plugin.
 */

export type HostFieldType =
  | "boolean"
  | "string"
  | "number"
  | "select"
  | "multiselect"
  | "secret"
  | "textarea"
  | "json"
  | "custom";

export interface HostSettingField {
  key: string;
  type: HostFieldType;
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  default?: unknown;
  options?: { value: string; labelKey: string }[];
  min?: number;
  max?: number;
  requires?: string;
  hidden?: boolean;
  ownerOnly?: boolean;
}

export interface PluginHostSettings {
  enableKey?: string;
  enableLabelKey?: string;
  enableDescriptionKey?: string;
  enableDefault?: boolean;
  editorGroup: "top" | "ssh";
  editorOrder?: number;
  fields: HostSettingField[];
}

const TYPES = new Set<HostFieldType>([
  "boolean",
  "string",
  "number",
  "select",
  "multiselect",
  "secret",
  "textarea",
  "json",
  "custom",
]);

/** Field types the phone can draw. */
export const SIMPLE_FIELD_TYPES = new Set<HostFieldType>([
  "boolean",
  "string",
  "number",
  "select",
  "secret",
  "textarea",
]);

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function parseField(raw: unknown): HostSettingField | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const key = str(f.key);
  const type = f.type as HostFieldType;
  if (!key || !TYPES.has(type)) return null;
  const field: HostSettingField = { key, type };
  for (const name of [
    "labelKey",
    "descriptionKey",
    "placeholderKey",
    "requires",
  ] as const) {
    const value = str(f[name]);
    if (value) field[name] = value;
  }
  if (f.default !== undefined) field.default = f.default;
  if (typeof f.min === "number") field.min = f.min;
  if (typeof f.max === "number") field.max = f.max;
  if (f.hidden === true) field.hidden = true;
  if (f.ownerOnly === true) field.ownerOnly = true;
  if (Array.isArray(f.options)) {
    field.options = f.options
      .filter(
        (o): o is { value: string; labelKey: string } =>
          !!o &&
          typeof (o as { value?: unknown }).value === "string" &&
          typeof (o as { labelKey?: unknown }).labelKey === "string",
      )
      .map((o) => ({ value: o.value, labelKey: o.labelKey }));
  }
  return field;
}

/** Reads a manifest's settings.host, or a copy the app cached. */
export function parseHostSettings(
  raw: unknown,
): PluginHostSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const h = raw as Record<string, unknown>;
  const fields = Array.isArray(h.fields)
    ? h.fields.map(parseField).filter((f): f is HostSettingField => !!f)
    : [];
  const enableKey = str(h.enableKey);
  if (fields.length === 0 && !enableKey) return undefined;
  const out: PluginHostSettings = {
    editorGroup: h.editorGroup === "ssh" ? "ssh" : "top",
    fields,
  };
  if (enableKey) out.enableKey = enableKey;
  const enableLabelKey = str(h.enableLabelKey);
  if (enableLabelKey) out.enableLabelKey = enableLabelKey;
  const enableDescriptionKey = str(h.enableDescriptionKey);
  if (enableDescriptionKey) out.enableDescriptionKey = enableDescriptionKey;
  if (typeof h.enableDefault === "boolean") out.enableDefault = h.enableDefault;
  if (typeof h.editorOrder === "number") out.editorOrder = h.editorOrder;
  return out;
}

/** "showPanel" becomes "Show panel", for a field whose text did not load. */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/** Looks up a dotted key like settings.host.showPanel.label in a locale file. */
export function lookupString(
  strings: Record<string, unknown> | undefined,
  key: string | undefined,
): string | undefined {
  if (!strings || !key) return undefined;
  if (typeof strings[key] === "string") return strings[key] as string;
  let node: unknown = strings;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}
