import type { Credential, CredentialData } from "@/types";

export interface CredentialForm {
  name: string;
  description: string;
  folder: string;
  tags: string[];
  authType: "password" | "key";
  username: string;
  password: string;
  key: string;
  publicKey: string;
  keyPassword: string;
  certPublicKey: string;
}

export const EMPTY_CREDENTIAL: CredentialForm = {
  name: "",
  description: "",
  folder: "",
  tags: [],
  authType: "password",
  username: "",
  password: "",
  key: "",
  publicKey: "",
  keyPassword: "",
  certPublicKey: "",
};

/** The form for a login. The private key stays out; it is never shown again. */
export function formFromCredential(c: Credential | null): CredentialForm {
  if (!c) return { ...EMPTY_CREDENTIAL };
  return {
    name: c.name ?? "",
    description: c.description ?? "",
    folder: c.folder ?? "",
    tags: [...(c.tags ?? [])],
    authType: c.authType ?? "password",
    username: c.username ?? "",
    password: c.password ?? "",
    key: "",
    publicKey: c.publicKey ?? "",
    keyPassword: c.keyPassword ?? "",
    certPublicKey: c.certPublicKey ?? "",
  };
}

export function credentialError(
  form: CredentialForm,
  isEdit: boolean,
  hasSavedKey: boolean,
): string | null {
  if (!form.name.trim()) return "Give this credential a name";
  if (form.authType === "key" && !form.key.trim() && !(isEdit && hasSavedKey)) {
    return "Add a private key, or make a new one";
  }
  return null;
}

/** What to save. Blank secrets are left out, so saved ones are kept. */
export function credentialPayload(form: CredentialForm): CredentialData {
  const payload: CredentialData = {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    folder: form.folder.trim() || undefined,
    tags: form.tags,
    authType: form.authType,
    username: form.username.trim(),
  };
  if (form.authType === "password") {
    if (form.password) payload.password = form.password;
  } else {
    if (form.key.trim()) payload.key = form.key.trim();
    if (form.publicKey.trim()) payload.publicKey = form.publicKey.trim();
    if (form.keyPassword) payload.keyPassword = form.keyPassword;
    payload.certPublicKey = form.certPublicKey.trim();
  }
  return payload;
}

/** "box", "box:2222", "[fe80::1]:22" or a bare IPv6 address. */
export function parseTestAddress(
  text: string,
): { ip: string; port: number } | null {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  const bracket = value.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracket) return { ip: bracket[1], port: Number(bracket[2] ?? 22) };
  const colons = value.split(":").length - 1;
  if (colons === 1) {
    const [ip, port] = value.split(":");
    const n = Number(port);
    if (!ip || !Number.isInteger(n) || n < 1 || n > 65535) return null;
    return { ip, port: n };
  }
  return { ip: value, port: 22 };
}
