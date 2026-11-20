import {
  inspectCertificate,
  isSshEngineAvailable,
  type SshCertInfo,
} from "@/modules/termix-ssh";
import { t } from "@/i18n";

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
      : t("hosts.credentials.cert.forAnyUser"),
    info.validBefore >= NEVER
      ? t("hosts.credentials.cert.validFromNoEndDate", {
          validAfter: day(info.validAfter),
        })
      : `Valid ${day(info.validAfter)} to ${day(info.validBefore)}`,
    t("hosts.credentials.cert.signedBy", { caSha256: info.caSha256 }),
  ];
  const problems: string[] = [];
  if (info.isHost)
    problems.push(t("hosts.credentials.cert.thisIsAHostCertificate"));
  if (now < info.validAfter)
    problems.push(t("hosts.credentials.cert.thisCertificateIsNotValid"));
  if (info.validBefore < NEVER && now > info.validBefore) {
    problems.push(t("hosts.credentials.cert.thisCertificateHasExpired"));
  }
  if (keyType && baseKeyType(info.keyType) !== baseKeyType(keyType)) {
    problems.push(
      t("hosts.credentials.cert.itIsForAKey", {
        keyType: baseKeyType(info.keyType),
        keyType2: keyType,
      }),
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
