import type { FormDefaults } from "@/core/hosts/defaults/form";
import type {
  HostEditorSectionDef,
  HostFormValues,
  HostToggleDef,
} from "@/core/features/types";
import type { AuthType, JumpHostData, SSHHost, SSHHostData } from "@/types";

/** The parts of the host editor the screen owns. Sections keep their own values. */
export interface HostEditorForm {
  name: string;
  ip: string;
  port: string;
  folder: string;
  tags: string[];
  pin: boolean;
  notes: string;
  color: string | null;
  icon: string | null;
  enableSsh: boolean;
  username: string;
  authType: AuthType;
  vaultProfileId: number | null;
  password: string;
  key: string;
  keyPassword: string;
  credentialId?: number;
  sudoPassword: string;
  jumpHosts: number[];
  /** Every host switch from the registry, by key. */
  toggles: Record<string, boolean>;
}

export const EMPTY_FORM: HostEditorForm = {
  name: "",
  ip: "",
  port: "22",
  folder: "",
  tags: [],
  pin: false,
  notes: "",
  color: null,
  icon: null,
  enableSsh: true,
  username: "",
  authType: "password",
  vaultProfileId: null,
  password: "",
  key: "",
  keyPassword: "",
  credentialId: undefined,
  sudoPassword: "",
  jumpHosts: [],
  toggles: {},
};

function vaultProfileOf(source: Partial<SSHHost>): number | null {
  const id = Number(source.pluginSettings?.vault?.profileId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Switch values for a host, or what a new host starts with. */
export function togglesFrom(
  toggles: HostToggleDef[],
  source: Partial<SSHHost> | null | undefined,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const toggle of toggles) {
    const value = (source as Record<string, unknown> | null | undefined)?.[
      toggle.key
    ];
    out[toggle.key] =
      typeof value === "boolean" ? value : (toggle.defaultOn ?? false);
  }
  return out;
}

/** Fills the form from a saved host (with its secrets) or a draft. */
export function formFromHost(
  source: Partial<SSHHost> | null | undefined,
  toggles: HostToggleDef[],
): HostEditorForm {
  if (!source) return { ...EMPTY_FORM, toggles: togglesFrom(toggles, null) };
  return {
    name: source.name ?? "",
    ip: source.ip ?? "",
    port: String(source.port || source.sshPort || 22),
    folder: source.folder ?? "",
    tags: [...(source.tags ?? [])],
    pin: !!source.pin,
    notes: source.notes ?? "",
    color: source.color ?? null,
    icon: source.icon ?? null,
    enableSsh: source.enableSsh !== false,
    username: source.username ?? "",
    authType: (source.authType ?? "password") as AuthType,
    vaultProfileId: vaultProfileOf(source),
    password: source.password ?? "",
    key: typeof source.key === "string" ? source.key : "",
    keyPassword: source.keyPassword ?? "",
    credentialId: source.credentialId,
    sudoPassword: source.sudoPassword ?? "",
    jumpHosts: (source.jumpHosts ?? [])
      .map((jump) => Number(jump.hostId))
      .filter((id) => Number.isFinite(id)),
    toggles: togglesFrom(toggles, source),
  };
}

/** Applies host defaults to a new host's form, keeping what the user typed. */
export function applyFormDefaults(
  form: HostEditorForm,
  found: FormDefaults,
  previous: FormDefaults,
): HostEditorForm {
  const untouched = <T>(current: T, before: T | undefined, empty: T) =>
    current === empty || (before !== undefined && current === before);
  const next = { ...form };
  if (untouched(form.username, previous.username, "")) {
    next.username = found.username ?? "";
  }
  const prevPort = previous.port !== undefined ? String(previous.port) : "22";
  if (untouched(form.port, prevPort, "")) {
    next.port = String(found.port ?? 22);
  }
  if (
    found.authType &&
    untouched(form.authType, previous.authType as AuthType, "password")
  ) {
    next.authType = found.authType as AuthType;
    next.credentialId = found.credentialId ?? next.credentialId;
  }
  return next;
}

/** The sections that show for these switches. */
export function visibleSections(
  sections: HostEditorSectionDef[],
  form: Pick<HostEditorForm, "enableSsh" | "toggles">,
): HostEditorSectionDef[] {
  return sections.filter((section) => {
    if (section.group === "ssh" && !form.enableSsh) return false;
    if (section.toggle && !form.toggles[section.toggle]) return false;
    return true;
  });
}

const GROUP_ORDER: Record<HostEditorSectionDef["group"], number> = {
  host: 0,
  ssh: 1,
  protocol: 2,
  feature: 3,
};

export function sortSections(
  sections: HostEditorSectionDef[],
): HostEditorSectionDef[] {
  return [...sections].sort(
    (a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.order - b.order,
  );
}

const PORT = (value: string) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 65535;
};

/** The first thing stopping a save, in plain words. */
export function formError(
  form: HostEditorForm,
  toggles: HostToggleDef[],
): string | null {
  if (!form.ip.trim()) return "Enter the host's address";
  if (/\s/.test(form.ip.trim())) return "The address can't have spaces";
  if (form.port && !PORT(form.port)) return "Port must be from 1 to 65535";
  const protocolOn =
    form.enableSsh ||
    toggles.some((t) => t.group === "protocol" && form.toggles[t.key]);
  if (!protocolOn) return "Turn on at least one protocol";
  if (form.enableSsh) {
    if (form.authType !== "none" && form.authType !== "credential") {
      if (!form.username.trim()) return "Enter the SSH username";
    }
    if (form.authType === "credential" && !form.credentialId) {
      return "Pick a credential";
    }
  }
  return null;
}

/** Whether a host can be a jump host for this one without a loop. */
export function canJumpThrough(
  candidate: SSHHost,
  selfId: number | undefined,
  byId: Map<number, SSHHost>,
): boolean {
  if (candidate.id === selfId) return false;
  if (selfId === undefined) return true;
  const seen = new Set<number>();
  const walk = (host: SSHHost | undefined): boolean => {
    if (!host || seen.has(host.id)) return true;
    seen.add(host.id);
    for (const jump of host.jumpHosts ?? []) {
      if (jump.hostId === selfId) return false;
      if (!walk(byId.get(jump.hostId))) return false;
    }
    return true;
  };
  return walk(candidate);
}

export interface PayloadInputs {
  form: HostEditorForm;
  host: SSHHost | null;
  toggles: HostToggleDef[];
  sections: HostEditorSectionDef[];
  sectionValues: Record<string, HostFormValues>;
  /** What the new host form was filled with from the defaults. */
  filledDefaults: FormDefaults;
  /** The sudo password the host had when the editor opened. */
  savedSudo: string;
}

/** The host to save. Fields the editor does not show keep their saved value. */
export function payloadFromForm({
  form,
  host,
  toggles,
  sections,
  sectionValues,
  filledDefaults,
  savedSudo,
}: PayloadInputs): SSHHostData {
  const isEdit = !!host;
  const auth = form.authType;
  const payload: SSHHostData = {
    name: form.name.trim() || form.ip.trim(),
    ip: form.ip.trim(),
    port: parseInt(form.port, 10) || 22,
    username: form.username.trim(),
    folder: form.folder.trim(),
    tags: form.tags,
    pin: form.pin,
    notes: form.notes,
    color: form.color,
    icon: form.icon,
    authType: auth,
    vaultProfileId: auth === "vault" ? form.vaultProfileId : undefined,
    password: auth === "password" ? form.password : undefined,
    key: auth === "key" ? (form.key as never) : undefined,
    keyPassword: auth === "key" ? form.keyPassword : undefined,
    credentialId: auth === "credential" ? form.credentialId : undefined,
    jumpHosts: form.jumpHosts.map((hostId): JumpHostData => ({ hostId })),
    enableSsh: form.enableSsh,
    // Not edited here; kept as they are.
    quickActions: host?.quickActions,
    statsConfig: host?.statsConfig,
    terminalConfig: host?.terminalConfig,
    overrideCredentialUsername: host?.overrideCredentialUsername,
    forceKeyboardInteractive: host?.forceKeyboardInteractive,
    tunnelConnections: host?.tunnelConnections ?? [],
    defaultPath: host?.defaultPath ?? "/",
    macAddress: host?.macAddress ?? "",
  };
  for (const toggle of toggles) {
    (payload as unknown as Record<string, unknown>)[toggle.key] =
      !!form.toggles[toggle.key];
  }
  // Values still as the defaults filled them are left out, so the host
  // follows the defaults of the folder it ends up in.
  if (!isEdit) {
    if (
      filledDefaults.username !== undefined &&
      payload.username === filledDefaults.username
    ) {
      payload.username = "";
    }
    if (
      filledDefaults.port !== undefined &&
      payload.port === filledDefaults.port
    ) {
      payload.port = 0;
    }
  }
  // Only sent when changed, so a host whose secret the phone can't read keeps it.
  if (form.enableSsh && form.sudoPassword !== savedSudo) {
    payload.sudoPassword = form.sudoPassword;
  }
  for (const section of sections) {
    const value = sectionValues[section.id];
    if (value) section.editor.write(value, payload);
  }
  return payload;
}
