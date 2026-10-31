import type { ServerPlugin } from "@/core/api/compat/server-features";
import {
  SIMPLE_FIELD_TYPES,
  type HostSettingField,
  type PluginHostSettings,
} from "@/core/plugins/host-settings";
import type { HostFormValues } from "@/core/features/types";
import type { SSHHost } from "@/types";

export interface PluginFieldsPlan {
  plugin: ServerPlugin;
  settings: PluginHostSettings;
  /** Fields the phone draws, in manifest order. */
  fields: HostSettingField[];
  /** Some fields can only be changed on the web. */
  webOnly: boolean;
  /** The plugin's own switch, unless a native host switch already has it. */
  enableKey?: string;
  /** A native host switch with the same key shows the section. */
  toggle?: string;
}

/**
 * Which server plugins get a generated section: running, with host settings,
 * and no native section of their own.
 */
export function planPluginFields(
  plugins: ServerPlugin[] | null,
  covered: Set<string>,
  nativeToggles: Set<string>,
): PluginFieldsPlan[] {
  const out: PluginFieldsPlan[] = [];
  for (const plugin of plugins ?? []) {
    const settings = plugin.hostSettings;
    if (!plugin.active || !settings || covered.has(plugin.id)) continue;
    const visible = settings.fields.filter(
      (f) => !f.hidden && f.key !== settings.enableKey,
    );
    const fields = visible.filter((f) => SIMPLE_FIELD_TYPES.has(f.type));
    const sharedToggle =
      settings.enableKey && nativeToggles.has(settings.enableKey)
        ? settings.enableKey
        : undefined;
    const enableKey = sharedToggle ? undefined : settings.enableKey;
    if (fields.length === 0 && !enableKey) continue;
    out.push({
      plugin,
      settings,
      fields,
      webOnly: fields.length < visible.length,
      enableKey,
      toggle: sharedToggle,
    });
  }
  return out;
}

function stored(host: SSHHost | null, pluginId: string) {
  return (host?.pluginSettings?.[pluginId] ?? {}) as Record<string, unknown>;
}

/** The section's starting values: what the host has, else the defaults. */
export function readPluginFields(
  plan: PluginFieldsPlan,
  host: SSHHost | null,
): HostFormValues {
  const saved = stored(host, plan.plugin.id);
  const values: HostFormValues = {};
  if (plan.enableKey) {
    values[plan.enableKey] =
      typeof saved[plan.enableKey] === "boolean"
        ? saved[plan.enableKey]
        : (plan.settings.enableDefault ?? false);
  }
  for (const field of plan.fields) {
    const value = saved[field.key];
    values[field.key] =
      value !== undefined && value !== null ? value : field.default;
  }
  return values;
}

/** Turns typed text back into the field's type before it is saved. */
export function fieldValue(field: HostSettingField, value: unknown): unknown {
  if (field.type === "boolean") return value === true;
  if (field.type === "number") {
    if (value === "" || value === undefined || value === null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (value === undefined || value === null) return "";
  return String(value);
}

/**
 * Only values that differ from what the section started with go out, so
 * untouched ones keep following host defaults.
 */
export function changedPluginFields(
  plan: PluginFieldsPlan,
  before: HostFormValues,
  values: HostFormValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = [
    ...(plan.enableKey ? [plan.enableKey] : []),
    ...plan.fields.map((f) => f.key),
  ];
  for (const key of keys) {
    const field = plan.fields.find((f) => f.key === key) ?? {
      key,
      type: "boolean" as const,
    };
    const next = fieldValue(field, values[key]);
    if (JSON.stringify(next) !== JSON.stringify(fieldValue(field, before[key])))
      out[key] = next;
  }
  return out;
}

/** A number outside the field's range, as a message. */
export function pluginFieldError(
  plan: PluginFieldsPlan,
  values: HostFormValues,
  label: (field: HostSettingField) => string,
): string | null {
  for (const field of plan.fields) {
    if (field.type !== "number") continue;
    const raw = values[field.key];
    if (raw === "" || raw === undefined || raw === null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) return `${label(field)} must be a number`;
    if (field.min !== undefined && n < field.min)
      return `${label(field)} must be at least ${field.min}`;
    if (field.max !== undefined && n > field.max)
      return `${label(field)} must be at most ${field.max}`;
  }
  return null;
}
