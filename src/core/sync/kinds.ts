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
    label: "Hosts and folders",
    description: "Your hosts, folders and hosts shared with you",
    types: ["hosts", "sshFolders", "sharedHosts"],
  },
  {
    id: "logins",
    label: "Credentials",
    description: "Saved passwords and keys, and credentials shared with you",
    types: ["sshCredentials", "sharedCredentials"],
  },
  {
    id: "snippets",
    label: "Snippets",
    description: "Snippets and their folders",
    types: ["snippets", "snippetFolders"],
  },
  {
    id: "hostDefaults",
    label: "Host defaults",
    description: "Default settings for new hosts",
    types: ["hostDefaults", "hostDefaultsAdmin"],
  },
  {
    id: "preferences",
    label: "Preferences",
    description: "Settings that follow you between devices",
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
