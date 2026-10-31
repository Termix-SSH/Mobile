import type { DataRepositories } from "@/core/data/types";
import type { SSHHost, SSHHostData } from "@/types";

/** Hosts on this address show as offline. */
export const OFFLINE_IP = "10.20.0.99";

export interface SeedHost extends SSHHostData {
  name: string;
}

const ssh = (
  name: string,
  ip: string,
  folder: string,
  extra: Partial<SSHHostData> = {},
): SeedHost => ({
  name,
  ip,
  port: 22,
  username: "admin",
  authType: "password",
  password: "showcase",
  folder,
  enableTerminal: true,
  enableFileManager: true,
  ...extra,
});

/** A small homelab plus a few production boxes. */
export const SEED_HOSTS: SeedHost[] = [
  ssh("web-01", "10.20.1.11", "Prod / Web", {
    color: "#22c55e",
    icon: "globe",
    pin: true,
    enableDocker: true,
    tags: ["nginx", "prod"],
  }),
  ssh("web-02", "10.20.1.12", "Prod / Web", {
    color: "#22c55e",
    icon: "globe",
    enableDocker: true,
    tags: ["nginx", "prod"],
  }),
  ssh("db-primary", "10.20.2.10", "Prod / Databases", {
    color: "#3b82f6",
    icon: "database",
    pin: true,
    tags: ["postgres", "prod"],
  }),
  ssh("db-replica", "10.20.2.11", "Prod / Databases", {
    color: "#3b82f6",
    icon: "database",
    tags: ["postgres"],
  }),
  ssh("pve-node1", "10.20.3.2", "Homelab / Proxmox", {
    color: "#f59145",
    icon: "server",
    enableDocker: true,
    tags: ["proxmox"],
  }),
  ssh("pve-node2", "10.20.3.3", "Homelab / Proxmox", {
    color: "#f59145",
    icon: "server",
    tags: ["proxmox"],
  }),
  ssh("nas", "10.20.3.20", "Homelab", {
    color: "#a855f7",
    icon: "hard-drive",
    enableDocker: true,
    tags: ["storage"],
  }),
  ssh("pihole", "10.20.3.53", "Homelab", {
    color: "#ef4444",
    icon: "shield",
    tags: ["dns"],
  }),
  ssh("home-assistant", "10.20.3.40", "Homelab", {
    color: "#06b6d4",
    icon: "house",
    enableDocker: true,
  }),
  ssh("edge-fra", "10.20.4.1", "Edge", {
    color: "#eab308",
    icon: "cloud",
    tags: ["vps"],
  }),
  ssh("edge-nyc", "10.20.4.2", "Edge", {
    color: "#eab308",
    icon: "cloud",
    tags: ["vps"],
  }),
  ssh("backup-old", OFFLINE_IP, "Edge", { icon: "archive" }),
  ssh("raspberry-pi", "10.20.3.80", "", {
    username: "pi",
    icon: "cpu",
  }),
];

export const SEED_SNIPPET_FOLDERS = [
  { name: "Updates", color: "#22c55e", icon: "download" },
  { name: "Docker", color: "#3b82f6", icon: "container" },
  { name: "Debug", color: "#f59145", icon: "bug" },
];

export const SEED_SNIPPETS = [
  {
    name: "Update packages",
    content: "sudo apt update && sudo apt upgrade -y",
    folder: "Updates",
  },
  {
    name: "Reboot if needed",
    content: "[ -f /var/run/reboot-required ] && sudo reboot",
    folder: "Updates",
  },
  {
    name: "Prune images",
    content: "docker image prune -af",
    folder: "Docker",
  },
  {
    name: "Compose pull and up",
    content: "docker compose pull && docker compose up -d",
    folder: "Docker",
  },
  { name: "Disk usage", content: "df -h /", folder: "Debug" },
  {
    name: "Last errors",
    content: "journalctl -p err -n 20 --no-pager",
    folder: "Debug",
  },
];

export const SEED_HISTORY = [
  "docker compose up -d",
  "htop",
  "sudo systemctl restart nginx",
  "tail -f /var/log/nginx/access.log",
  "git pull",
];

/** Where the showcase scenarios point, by host name. */
export const MAIN_HOST = "web-01";
export const SECOND_HOST = "db-primary";
export const DOCKER_HOST = "nas";

/** Deterministic noise, so every run draws the same charts. */
export function wave(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 0.31) * 0.5;
  const y = Math.sin(seed * 3.7 + i * 0.07) * 0.5;
  return (x + y + 1) / 2;
}

/**
 * Replaces everything on This device with the showcase data. Returns the
 * created hosts by name.
 */
export async function seedShowcase(
  repos: DataRepositories,
  now = Date.now(),
): Promise<Map<string, SSHHost>> {
  for (const h of await repos.hosts.list()) await repos.hosts.remove(h.id);
  for (const s of await repos.snippets.list())
    await repos.snippets.remove(s.id);
  for (const f of await repos.snippetFolders.list())
    await repos.snippetFolders.remove(f.name);
  for (const c of await repos.credentials.list())
    await repos.credentials.remove(c.id);

  await repos.credentials.create({
    name: "Homelab admin",
    username: "admin",
    authType: "password",
    password: "showcase",
    tags: ["homelab"],
  });
  await repos.credentials.create({
    name: "Deploy key",
    username: "deploy",
    authType: "key",
    tags: ["prod"],
  });

  const byName = new Map<string, SSHHost>();
  for (const draft of SEED_HOSTS) {
    const host = await repos.hosts.create(draft);
    byName.set(draft.name, host);
  }

  for (const folder of SEED_SNIPPET_FOLDERS) {
    await repos.snippetFolders.create(folder);
  }
  for (const [order, s] of SEED_SNIPPETS.entries()) {
    await repos.snippets.create({ ...s, order });
  }

  const main = byName.get(MAIN_HOST);
  if (main) {
    for (const cmd of [...SEED_HISTORY].reverse()) {
      await repos.commandHistory.add(main, cmd);
    }
  }

  // A day of history, one point every 10 minutes, for the metric charts.
  const step = 10 * 60_000;
  for (const [seed, name] of [MAIN_HOST, SECOND_HOST, DOCKER_HOST].entries()) {
    const host = byName.get(name);
    if (!host) continue;
    for (let i = 144; i >= 1; i--) {
      const w = wave(seed + 1, i);
      await repos.metricSamples.append(host, {
        ts: now - i * step,
        cpu: Math.round((12 + w * 38) * 10) / 10,
        mem: Math.round((48 + w * 14) * 10) / 10,
        disk: 61 + seed * 7,
        rx: Math.round(200_000 + w * 1_800_000),
        tx: Math.round(80_000 + w * 600_000),
      });
    }
  }

  for (const [kind, name] of [
    ["file-manager", DOCKER_HOST],
    ["docker", DOCKER_HOST],
    ["terminal", SECOND_HOST],
    ["terminal", MAIN_HOST],
  ] as const) {
    const host = byName.get(name);
    await repos.recentActivity.add({
      kind,
      title: name,
      hostSyncId: host?.syncId ?? null,
    });
  }

  return byName;
}
