import type { ContainerCounts } from "@termix-ssh/plugin-sdk/host-scripts";
import type { MetricPoint } from "@/core/data/types";
import type { ExecRunner } from "@/core/exec";
import type { DockerContainer, ServerMetrics } from "@/types";
import type { DockerBackend } from "@/features/docker/backend/types";
import type {
  FileBackend,
  FileEntry,
} from "@/features/file-manager/backend/types";
import { wave } from "./seed";

// Feature backends with fixed data, so metric, Docker and file screens look
// alive with no host behind them.

let tick = 0;

export function showcaseMetricsSample(
  hostId: number,
  at = Date.now(),
): { metrics: ServerMetrics; point: MetricPoint } {
  const w = wave(hostId, tick++);
  const cpu = Math.round((18 + w * 22) * 10) / 10;
  const perCore = Array.from(
    { length: 16 },
    (_, i) => Math.round(wave(hostId + i, tick) * 60 * 10) / 10,
  );
  const metrics: ServerMetrics = {
    cpu: {
      percent: cpu,
      cores: 16,
      load: [0.42, 0.38, 0.31],
      perCore,
      coreIds: perCore.map((_, i) => `cpu${i}`),
      mix: { user: cpu * 0.7, system: cpu * 0.25, iowait: 0.4, steal: 0 },
    },
    memory: {
      percent: 38.6,
      usedGiB: 12.1,
      totalGiB: 31.3,
      cachedGiB: 9.4,
      freeGiB: 9.8,
    },
    disk: {
      percent: 61,
      usedHuman: "286G",
      totalHuman: "468G",
      availableHuman: "182G",
      mount: "/",
    },
    network: {
      interfaces: [
        {
          name: "eth0",
          state: "UP",
          ip: "10.20.1.11",
          rx: `${(1.2 + w * 3).toFixed(1)} MB/s`,
          tx: `${(380 + w * 220).toFixed(0)} KB/s`,
        },
        { name: "tailscale0", state: "UP", ip: "100.64.0.11" },
      ],
    },
    uptime: { seconds: 3_553_200, formatted: "41d 3h 0m" },
    processes: {
      total: 214,
      running: 3,
      top: [
        { pid: 1412, cpu: 12.4, mem: 3.1, command: "postgres" },
        { pid: 988, cpu: 6.2, mem: 1.4, command: "nginx" },
        { pid: 2301, cpu: 4.8, mem: 5.6, command: "node" },
        { pid: 2177, cpu: 2.1, mem: 0.9, command: "redis-server" },
        { pid: 3020, cpu: 1.3, mem: 2.2, command: "grafana" },
        { pid: 640, cpu: 0.6, mem: 0.3, command: "dockerd" },
      ],
    },
    system: {
      hostname: "web-01",
      os: "Debian GNU/Linux 13 (trixie)",
      kernel: "6.12.0-amd64",
      arch: "x86_64",
    },
    lastChecked: new Date(at).toISOString(),
  };
  return {
    metrics,
    point: {
      ts: at,
      cpu,
      mem: 38.6,
      disk: 61,
      rx: 1_200_000 + w * 3_000_000,
      tx: 380_000 + w * 220_000,
    },
  };
}

export function showcaseMetrics(hostId: number) {
  return {
    async sample() {
      return showcaseMetricsSample(hostId);
    },
  };
}

const CONTAINERS: DockerContainer[] = [
  ["nginx", "nginx:1.27-alpine", "Up 12 days", "running", "80/tcp, 443/tcp"],
  [
    "termix",
    "ghcr.io/termix-ssh/termix:latest",
    "Up 12 days",
    "running",
    "8080/tcp",
  ],
  ["postgres", "postgres:17", "Up 12 days (healthy)", "running", "5432/tcp"],
  ["redis", "redis:7-alpine", "Up 12 days", "running", "6379/tcp"],
  ["grafana", "grafana/grafana:11", "Up 3 days", "running", "3000/tcp"],
  ["prometheus", "prom/prometheus", "Up 3 days", "running", "9090/tcp"],
  ["jellyfin", "jellyfin/jellyfin", "Up 6 hours", "running", "8096/tcp"],
  ["backup", "restic/restic", "Exited (0) 2 hours ago", "exited", ""],
].map(([name, image, status, state, ports], i) => ({
  id: `c0ffee${String(i).padStart(2, "0")}a1b2c3`,
  name,
  image,
  status,
  state,
  ports,
  created: "2026-10-15 09:12:00",
}));

const LOGS = [
  '10.20.0.5 - - [27/Oct/2026:09:41:02] "GET / HTTP/2" 200 612',
  '10.20.0.5 - - [27/Oct/2026:09:41:03] "GET /api/hosts HTTP/2" 200 4810',
  '10.20.0.7 - - [27/Oct/2026:09:41:05] "GET /assets/app.js HTTP/2" 304 0',
  '10.20.0.5 - - [27/Oct/2026:09:41:09] "POST /api/ssh HTTP/2" 101 0',
].join("\n");

export function showcaseDocker(
  runner: ExecRunner,
): DockerBackend & { counts(): Promise<ContainerCounts> } {
  return {
    via: "local",
    check: async () => ({
      available: true,
      version: "27.3.1",
      runtime: "docker",
    }),
    containers: async () => CONTAINERS,
    action: async () => {},
    stats: async () => ({
      cpu: "2.41%",
      memoryUsed: "48.2MiB",
      memoryLimit: "31.3GiB",
      memoryPercent: "0.15%",
      netInput: "1.21GB",
      netOutput: "3.84GB",
      blockRead: "12.1MB",
      blockWrite: "4.1kB",
      pids: "9",
    }),
    logs: async () => LOGS,
    stacksEnabled: async () => false,
    stacks: async () => [],
    stack: async () => {
      throw new Error("No stacks");
    },
    console: () => ({ kind: "local", runner, runtime: "docker", sudo: false }),
    counts: async () => ({ running: 7, stopped: 1, unhealthy: 0, total: 8 }),
  };
}

const DAY = 86_400;
const NOW_S = Math.floor(Date.UTC(2026, 9, 27, 9, 41) / 1000);

type Node = { size?: number; age?: number; mode?: number; text?: string };

const dir = (age = 2): Node => ({ age, mode: 0o755 });
const file = (size: number, age: number, text?: string): Node => ({
  size,
  age,
  mode: 0o644,
  text,
});

const COMPOSE = `services:
  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx:/etc/nginx/conf.d:ro
    restart: unless-stopped

  termix:
    image: ghcr.io/termix-ssh/termix:latest
    ports:
      - "8080:8080"
    volumes:
      - termix-data:/app/data
    restart: unless-stopped

  postgres:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db
    volumes:
      - pg-data:/var/lib/postgresql/data

volumes:
  termix-data:
  pg-data:
`;

const TREE: Record<string, Record<string, Node>> = {
  "/home/admin": {
    ".config": dir(30),
    backups: dir(1),
    stacks: dir(3),
    "compose.yml": file(COMPOSE.length, 3, COMPOSE),
    "deploy.sh": { ...file(1840, 6), mode: 0o755 },
    "notes.md": file(2210, 12, "# Notes\n\n- Renew certs in December\n"),
    ".bashrc": file(3771, 90),
    "access.log": file(48_211_904, 0),
    "photo-backup.tar.gz": file(3_221_225_472, 1),
  },
  "/home/admin/stacks": {
    monitoring: dir(3),
    media: dir(9),
    web: dir(12),
  },
  "/home/admin/backups": {
    "db-2026-10-27.sql.gz": file(412_385_280, 0),
    "db-2026-10-26.sql.gz": file(409_993_216, 1),
    "db-2026-10-25.sql.gz": file(407_633_920, 2),
  },
  "/home/admin/.config": {},
};

function entry(parent: string, name: string, node: Node): FileEntry {
  const isDir = node.size === undefined;
  return {
    name,
    path: `${parent === "/" ? "" : parent}/${name}`,
    type: isDir ? "directory" : "file",
    size: isDir ? 4096 : (node.size ?? 0),
    mtime: NOW_S - (node.age ?? 0) * DAY - 3600,
    mode: node.mode ?? 0o644,
    owner: "admin",
    group: "admin",
    uid: 1000,
    gid: 1000,
  };
}

function nodeAt(path: string): Node | null {
  const cut = path.lastIndexOf("/");
  const parent = path.slice(0, cut) || "/";
  return TREE[parent]?.[path.slice(cut + 1)] ?? null;
}

export function showcaseFiles(): FileBackend {
  const nothing = async () => {};
  return {
    kind: "sftp",
    home: async () => "/home/admin",
    async list(path) {
      const files = Object.entries(TREE[path] ?? {}).map(([name, node]) =>
        entry(path, name, node),
      );
      return { path, files };
    },
    async stat(path) {
      const cut = path.lastIndexOf("/");
      return entry(
        path.slice(0, cut) || "/",
        path.slice(cut + 1),
        nodeAt(path) ?? dir(),
      );
    },
    mkdir: nothing,
    createFile: nothing,
    rename: nothing,
    move: nothing,
    copy: nothing,
    remove: nothing,
    chmod: nothing,
    symlink: null,
    folderSize: async () => 1_284_505_600,
    async readText(path) {
      const node = nodeAt(path);
      return { text: node?.text ?? "", size: node?.size ?? 0 };
    },
    writeText: nothing,
    download: nothing,
    upload: nothing,
    uploadedBytes: async () => 0,
    trash: null,
    close: () => {},
  };
}
