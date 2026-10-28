import { sign } from "node:crypto";

const b64url = (data: Buffer | string) =>
  Buffer.from(data).toString("base64url");

/** A signed JWT. ES256 for App Store Connect, RS256 for Google. */
export function jwt(
  alg: "ES256" | "RS256",
  privateKey: string,
  payload: Record<string, unknown>,
  header: Record<string, unknown> = {},
): string {
  const head = b64url(JSON.stringify({ alg, typ: "JWT", ...header }));
  const body = b64url(JSON.stringify(payload));
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), {
    key: privateKey,
    // JWS wants the raw r||s form for ECDSA, not DER.
    dsaEncoding: alg === "ES256" ? "ieee-p1363" : undefined,
  });
  return `${head}.${body}.${b64url(signature)}`;
}
