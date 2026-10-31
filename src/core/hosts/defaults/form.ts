// What a new host form starts with: the defaults a host in that folder gets.
import { resolveForHost } from "./apply";
import { levelsForHost, type DefaultsIndex } from "./resolve";
import { coreKeyInfo, normalizeAuthDefault } from "./values";

export interface FormDefaults {
  username?: string;
  port?: number;
  authType?: string;
  credentialId?: number;
}

const INFO = coreKeyInfo();

export function formDefaults(
  index: DefaultsIndex,
  folder: string | null | undefined,
): FormDefaults {
  const levels = levelsForHost(index, folder);
  const valueOf = (key: string) =>
    resolveForHost(
      INFO.find((info) => info.key === key)!,
      levels,
      null,
    )?.value;
  const out: FormDefaults = {};
  const username = valueOf("username");
  if (typeof username === "string") out.username = username;
  const port = valueOf("sshPort");
  if (typeof port === "number") out.port = port;
  const auth = normalizeAuthDefault(valueOf("auth"));
  // A password or key lives on the host, so only the form's own types apply.
  if (auth && (auth.authType === "credential" || auth.authType === "none")) {
    out.authType = auth.authType;
    if (auth.credentialId !== null) out.credentialId = auth.credentialId;
  }
  return out;
}
