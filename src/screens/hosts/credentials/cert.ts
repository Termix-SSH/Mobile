import {
  inspectCertificate,
  isSshEngineAvailable,
  type SshCertInfo,
} from "@/modules/termix-ssh";

export type CertCheck =
  | { kind: "empty" }
  | { kind: "unchecked" }
  | { kind: "invalid" }
  | {
      kind: "ok";
      info: SshCertInfo;
      /** Plain lines to show under the field. */
      lines: string[];
      /** Problems that will stop it working. */
      problems: string[];
    };

const NEVER = 0xffffffffffffffff / 1000;

function day(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/** The key type a certificate is for, without the -cert part. */
export function baseKeyType(type: string): string {
  return type.replace(/-cert-v0[01]@openssh\.com$/, "");
}

/** What a certificate says, and whether it fits the key and the date. */
export function describeCertificate(
  info: SshCertInfo,
  keyType: string | null,
  now: number = Date.now() / 1000,
): { lines: string[]; problems: string[] } {
  const lines = [
    `ID ${info.keyId || "none"} | serial ${info.serial}`,
    info.principals.length
      ? `For ${info.principals.join(", ")}`
      : "For any user",
    info.validBefore >= NEVER
      ? `Valid from ${day(info.validAfter)}, no end date`
      : `Valid ${day(info.validAfter)} to ${day(info.validBefore)}`,
    `Signed by ${info.caSha256}`,
  ];
  const problems: string[] = [];
  if (info.isHost) problems.push("This is a host certificate, not a user one.");
  if (now < info.validAfter)
    problems.push("This certificate is not valid yet.");
  if (info.validBefore < NEVER && now > info.validBefore) {
    problems.push("This certificate has expired.");
  }
  if (keyType && baseKeyType(info.keyType) !== baseKeyType(keyType)) {
    problems.push(
      `It is for a ${baseKeyType(info.keyType)} key, but this key is ${keyType}.`,
    );
  }
  return { lines, problems };
}

export function checkCertificate(
  text: string,
  keyType: string | null,
): CertCheck {
  const value = text.trim();
  if (!value) return { kind: "empty" };
  if (!isSshEngineAvailable) return { kind: "unchecked" };
  try {
    const info = inspectCertificate(value);
    return { kind: "ok", info, ...describeCertificate(info, keyType) };
  } catch {
    return { kind: "invalid" };
  }
}
