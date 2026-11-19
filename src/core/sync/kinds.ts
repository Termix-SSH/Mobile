import { t as tr } from "@/i18n";

/** Groups of entity types the user can switch off in sync settings. */
export interface SyncKind {
  id: string;
  label: string;
  description: string;
  types: string[];
}

export const SYNC_KINDS: SyncKind[] = [
  {
    id: "hosts",
    label: tr("sync.kinds.hostsAndFolders"),
    description: tr("sync.kinds.yourHostsFoldersAndHosts"),
    types: ["hosts", "sshFolders", "sharedHosts"],
  },
  {
    id: "logins",
    label: tr("sync.kinds.credentials"),
    description: tr("sync.kinds.savedPasswordsAndKeysAnd"),
    types: ["sshCredentials", "sharedCredentials"],
  },
  {
    id: "snippets",
    label: tr("sync.kinds.snippets"),
    description: tr("sync.kinds.snippetsAndTheirFolders"),
    types: ["snippets", "snippetFolders"],
  },
  {
    id: "hostDefaults",
    label: tr("sync.kinds.hostDefaults"),
    description: tr("sync.kinds.defaultSettingsForNewHosts"),
    types: ["hostDefaults", "hostDefaultsAdmin"],
  },
  {
    id: "preferences",
    label: tr("sync.kinds.preferences"),
    description: tr("sync.kinds.settingsThatFollowYouBetween"),
    types: ["userPreferences"],
  },
];

/** Every type of the given kinds. */
export function typesOf(kindIds: string[]): string[] {
  return SYNC_KINDS.filter((k) => kindIds.includes(k.id)).flatMap(
    (k) => k.types,
  );
}

/** The kinds that are fully switched off by these disabled types. */
export function kindsOf(disabledTypes: string[]): string[] {
  return SYNC_KINDS.filter((k) =>
    k.types.every((t) => disabledTypes.includes(t)),
  ).map((k) => k.id);
}
