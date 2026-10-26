// Certificate pins: base64 sha256 of a server's public key (SPKI), the same
// value as openssl's pin and HPKP's pin-sha256.

const PIN = /^[A-Za-z0-9+/]{43}=$/;

/** A pin as typed or pasted: "sha256/" and spaces dropped. Null when it isn't one. */
export function normalizePin(text: string): string | null {
  const value = text
    .trim()
    .replace(/^sha256\//i, "")
    .replace(/\s+/g, "");
  return PIN.test(value) ? value : null;
}

/** Pins from a text box, one per line or comma separated, without repeats. */
export function parsePins(text: string): { pins: string[]; bad: string[] } {
  const pins: string[] = [];
  const bad: string[] = [];
  for (const part of text.split(/[\n,]+/)) {
    if (!part.trim()) continue;
    const pin = normalizePin(part);
    if (!pin) bad.push(part.trim());
    else if (!pins.includes(pin)) pins.push(pin);
  }
  return { pins, bad };
}

/** Host and port of a server URL, for reading its key. */
export function keyTarget(url: string): { host: string; port: number } {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : u.protocol === "http:" ? 80 : 443,
  };
}

/**
 * For a request to a pinned server that failed: reads the key the server
 * shows now. True when it is not a pinned one, so the failure is the pin.
 */
export async function pinMismatch(
  serverUrl: string,
  pins: string[],
  peek: (host: string, port: number) => Promise<{ pin: string }>,
): Promise<boolean> {
  if (!pins.length) return false;
  try {
    const { host, port } = keyTarget(serverUrl);
    const key = await peek(host, port);
    return !pins.includes(key.pin);
  } catch {
    // Can't reach it at all: offline, not the pin.
    return false;
  }
}
