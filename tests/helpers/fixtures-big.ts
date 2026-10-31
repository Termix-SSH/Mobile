import type { FileEntry } from "@/features/file-manager/backend/types";
import type { SSHHost } from "@/types";

// Big fake host and file lists for the bench and tests.

// Small seeded random, so every run sees the same data.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const WORDS = ["web", "db", "cache", "proxy", "build", "edge", "mail", "vpn"];
const REGIONS = ["eu", "us", "ap"];

/** Hosts in nested folders like "eu / prod / web", some with no folder. */
export function bigHostList(count = 2000, seed = 1): SSHHost[] {
  const rand = rng(seed);
  const hosts: SSHHost[] = [];
  for (let i = 0; i < count; i++) {
    const word = WORDS[Math.floor(rand() * WORDS.length)];
    const region = REGIONS[Math.floor(rand() * REGIONS.length)];
    const env = rand() < 0.5 ? "prod" : "staging";
    const folder = rand() < 0.05 ? "" : `${region} / ${env} / ${word}`;
    hosts.push({
      id: i + 1,
      name: `${word}-${region}-${String(i).padStart(4, "0")}`,
      ip: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`,
      port: 22,
      username: rand() < 0.5 ? "root" : "deploy",
      folder,
      tags: rand() < 0.3 ? [word, env] : [],
      pin: rand() < 0.02,
      sortOrder: rand() < 0.2 ? i : null,
      authType: "password",
      enableTerminal: true,
      enableTunnel: false,
      enableFileManager: true,
      defaultPath: "/",
      tunnelConnections: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as SSHHost);
  }
  return hosts;
}

/** A folder listing with files, folders and links. */
export function bigFileList(count = 20000, seed = 2): FileEntry[] {
  const rand = rng(seed);
  const now = Math.floor(Date.UTC(2026, 9, 25) / 1000);
  const exts = ["log", "txt", "json", "ts", "png", "tar.gz", "conf", ""];
  const files: FileEntry[] = [];
  for (let i = 0; i < count; i++) {
    const r = rand();
    const type = r < 0.1 ? "directory" : r < 0.13 ? "link" : "file";
    const ext = exts[Math.floor(rand() * exts.length)];
    const hidden = rand() < 0.05 ? "." : "";
    const name = `${hidden}file-${i}${ext ? `.${ext}` : ""}`;
    files.push({
      name,
      path: `/var/data/${name}`,
      type,
      size: Math.floor(rand() * 10_000_000),
      mtime: now - Math.floor(rand() * 400 * 86400),
      mode: 0o644,
      owner: "root",
      linkTarget: type === "link" ? "/srv/target" : null,
      targetType:
        type === "link" ? (rand() < 0.5 ? "directory" : "file") : null,
    });
  }
  return files;
}
