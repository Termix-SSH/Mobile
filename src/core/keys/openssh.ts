/**
 * Writes unencrypted OpenSSH private keys and public key lines, following
 * OpenSSH's PROTOCOL.key. Only the key types the phone makes are covered.
 */
import { toBase64 } from "@/modules/termix-ssh/src/base64";

const encoder = new TextEncoder();

class Writer {
  private parts: Uint8Array[] = [];

  raw(bytes: Uint8Array): this {
    this.parts.push(bytes);
    return this;
  }

  uint32(n: number): this {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, n >>> 0);
    return this.raw(out);
  }

  string(value: Uint8Array | string): this {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    return this.uint32(bytes.length).raw(bytes);
  }

  /** A positive big endian integer, with a leading zero when the top bit is set. */
  mpint(bytes: Uint8Array): this {
    let start = 0;
    while (start < bytes.length && bytes[start] === 0) start++;
    let body = bytes.slice(start);
    if (body.length && body[0] & 0x80) {
      const padded = new Uint8Array(body.length + 1);
      padded.set(body, 1);
      body = padded;
    }
    return this.string(body);
  }

  bytes(): Uint8Array {
    const size = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

export type OpenSshKey =
  | { type: "ssh-ed25519"; publicKey: Uint8Array; secret: Uint8Array }
  | {
      type: "ecdsa-sha2-nistp256";
      /** Uncompressed point, 65 bytes. */
      publicKey: Uint8Array;
      secret: Uint8Array;
    };

/** The key blob that goes in `authorized_keys` and on the wire. */
export function publicBlob(key: OpenSshKey): Uint8Array {
  const w = new Writer().string(key.type);
  if (key.type === "ecdsa-sha2-nistp256") w.string("nistp256");
  return w.string(key.publicKey).bytes();
}

export function publicLine(key: OpenSshKey, comment = ""): string {
  const line = `${key.type} ${toBase64(publicBlob(key))}`;
  return comment ? `${line} ${comment}` : line;
}

function privateFields(w: Writer, key: OpenSshKey): void {
  w.string(key.type);
  if (key.type === "ssh-ed25519") {
    // OpenSSH keeps the 32 byte seed followed by the public key.
    const both = new Uint8Array(64);
    both.set(key.secret, 0);
    both.set(key.publicKey, 32);
    w.string(key.publicKey).string(both);
  } else {
    w.string("nistp256").string(key.publicKey).mpint(key.secret);
  }
}

function wrap(text: string, width = 70): string {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) {
    lines.push(text.slice(i, i + width));
  }
  return lines.join("\n");
}

/**
 * The private key file text. `check` is the random check number OpenSSH
 * repeats twice so a wrong passphrase is caught.
 */
export function privateKeyText(
  key: OpenSshKey,
  check: number,
  comment = "",
): string {
  const inner = new Writer().uint32(check).uint32(check);
  privateFields(inner, key);
  inner.string(comment);
  let body = inner.bytes();
  const pad = (8 - (body.length % 8)) % 8;
  if (pad) {
    const padded = new Uint8Array(body.length + pad);
    padded.set(body);
    for (let i = 0; i < pad; i++) padded[body.length + i] = i + 1;
    body = padded;
  }
  const file = new Writer()
    .raw(encoder.encode("openssh-key-v1\0"))
    .string("none")
    .string("none")
    .string("")
    .uint32(1)
    .string(publicBlob(key))
    .string(body)
    .bytes();
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${wrap(toBase64(file))}\n-----END OPENSSH PRIVATE KEY-----\n`;
}
