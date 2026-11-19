// What the host defaults screen shows for each key, kept apart from the view.
import {
  levelsForHost,
  resolveKey,
  type DefaultsIndex,
} from "@/core/hosts/defaults/resolve";
import type { DefaultsTarget } from "@/core/hosts/defaults/store";
import {
  coreKeyInfo,
  CORE_NAMESPACE,
  normalizeAuthDefault,
  normalizeEnvironment,
  type DefaultSource,
} from "@/core/hosts/defaults/values";
import { t } from "@/i18n";

export type RowKind =
  "text" | "number" | "switch" | "auth" | "env" | "readonly";

export interface KeyRow {
  fullKey: string;
  label: string;
  hint?: string;
  kind: RowKind;
  /** Set at the level being edited. */
  own: boolean;
  /** The value at that level, or what the key inherits when it is not set. */
  value: unknown;
  /** Where an inherited value comes from. */
  source: DefaultSource | null;
}

const LABELS: Record<string, { label: string; hint?: string; kind: RowKind }> =
  {
    username: { label: t("hostDefaults.model.username"), kind: "text" },
    sshPort: { label: t("hostDefaults.model.sshPort"), kind: "number" },
    auth: {
      label: t("hostDefaults.model.authentication"),
      hint: t("hostDefaults.model.aSavedCredentialForNew"),
      kind: "auth",
    },
    forceKeyboardInteractive: {
      label: t("hostDefaults.model.forceKeyboardInteractive"),
      kind: "switch",
    },
    keepaliveInterval: {
      label: t("hostDefaults.model.keepaliveInterval"),
      hint: t("hostDefaults.model.seconds0TurnsItOff"),
      kind: "number",
    },
    keepaliveCountMax: {
      label: t("hostDefaults.model.keepaliveTries"),
      kind: "number",
    },
    allowLegacyAlgorithms: {
      label: t("hostDefaults.model.allowOldAlgorithms"),
      kind: "switch",
    },
    agentForwarding: {
      label: t("hostDefaults.model.agentForwarding"),
      kind: "switch",
    },
    environmentVariables: {
      label: t("hostDefaults.model.environmentVariables"),
      hint: t("hostDefaults.model.oneNameValuePerLine"),
      kind: "env",
    },
    statusCheckEnabled: {
      label: t("hostDefaults.model.checkIfTheHostIs"),
      kind: "switch",
    },
    statusCheckInterval: {
      label: t("hostDefaults.model.checkInterval"),
      hint: t("hostDefaults.model.secondsEmptyUsesTheServer"),
      kind: "number",
    },
    socks5: {
      label: t("hostDefaults.model.socks5Proxy"),
      hint: t("hostDefaults.model.setInTheWebApp"),
      kind: "readonly",
    },
    jumpHosts: {
      label: t("hostDefaults.model.jumpHosts"),
      hint: t("hostDefaults.model.setInTheWebApp"),
      kind: "readonly",
    },
    portKnockSequence: {
      label: t("hostDefaults.model.portKnocking"),
      hint: t("hostDefaults.model.setInTheWebApp"),
      kind: "readonly",
    },
  };

function valueAt(
  index: DefaultsIndex,
  target: DefaultsTarget,
  fullKey: string,
) {
  const map =
    target.level === "user"
      ? index.user
      : index.folders.get(target.folder)?.values;
  return map && map.has(fullKey)
    ? { found: true as const, value: map.get(fullKey) }
    : { found: false as const };
}

/** The keys the screen lists for one level, core ones in a fixed order. */
export function keyRows(
  index: DefaultsIndex,
  target: DefaultsTarget,
): KeyRow[] {
  const folder = target.level === "folder" ? target.folder : null;
  // Inherited values come from the levels above this one.
  const above = levelsForHost(index, folder);
  if (target.level === "folder") above.folders.pop();
  return coreKeyInfo()
    .filter((info) => info.levels.includes(target.level))
    .map((info) => {
      const meta = LABELS[info.key] ?? {
        label: info.key,
        kind: "text" as const,
      };
      const here = valueAt(index, target, info.fullKey);
      if (here.found) {
        return {
          fullKey: info.fullKey,
          label: meta.label,
          hint: meta.hint,
          kind: meta.kind,
          own: true,
          value: info.normalize(here.value),
          source: null,
        };
      }
      const inherited = resolveKey(info, above);
      return {
        fullKey: info.fullKey,
        label: meta.label,
        hint: meta.hint,
        kind: meta.kind,
        own: false,
        value: inherited?.value,
        source: inherited?.source ?? null,
      };
    });
}

/** Keys from plugins that a level sets, shown as plain text. */
export function pluginRows(
  index: DefaultsIndex,
  target: DefaultsTarget,
): { fullKey: string; text: string }[] {
  const map =
    target.level === "user"
      ? index.user
      : index.folders.get(target.folder)?.values;
  return [...(map?.entries() ?? [])]
    .filter(([key]) => !key.startsWith(`${CORE_NAMESPACE}.`))
    .map(([fullKey, value]) => ({ fullKey, text: formatValue(value) }))
    .sort((a, b) => a.fullKey.localeCompare(b.fullKey));
}

export function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "")
    return t("hostDefaults.model.notSet");
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  return JSON.stringify(value);
}

/** The text a row shows for its value. */
export function describeRow(
  row: Pick<KeyRow, "kind" | "value">,
  loginName?: (id: number) => string | undefined,
): string {
  if (row.kind === "auth") {
    const auth = normalizeAuthDefault(row.value);
    if (!auth) return t("hostDefaults.model.notSet");
    if (auth.authType === "credential" && auth.credentialId !== null) {
      return (
        loginName?.(auth.credentialId) ?? `Credential ${auth.credentialId}`
      );
    }
    return auth.authType === "none" ? "None" : auth.authType;
  }
  if (row.kind === "env") {
    const list = normalizeEnvironment(row.value);
    return list.length ? `${list.length} set` : t("hostDefaults.model.notSet");
  }
  if (row.kind === "readonly") {
    return Array.isArray(row.value) && row.value.length === 0
      ? t("hostDefaults.model.notSet")
      : row.value && typeof row.value === "object"
        ? "Set"
        : formatValue(row.value);
  }
  return formatValue(row.value);
}

/** Where an inherited value comes from, in words. */
export function sourceLabel(source: DefaultSource | null): string {
  if (!source) return "";
  switch (source.level) {
    case "admin":
      return t("hostDefaults.model.fromTheServer");
    case "user":
      return t("hostDefaults.model.fromYourDefaults");
    case "folder":
      return `From ${source.folderName ?? "a folder"}`;
    default:
      return t("hostDefaults.model.builtIn");
  }
}

/** One NAME=value per line, to the stored list. Bad lines are dropped. */
export function parseEnvText(text: string): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf("=");
    const key = (at > 0 ? line.slice(0, at) : "").trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    out.push({ key, value: line.slice(at + 1) });
  }
  return out;
}

export function envText(value: unknown): string {
  return normalizeEnvironment(value)
    .map((entry) => `${entry.key}=${entry.value}`)
    .join("\n");
}

/** What typing into a row stores. Null means the text is not a valid value. */
export function parseRowText(kind: RowKind, text: string): unknown | null {
  const trimmed = text.trim();
  if (kind === "number") {
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  if (kind === "env") return parseEnvText(text);
  if (kind === "text") return trimmed === "" ? null : trimmed;
  return null;
}
