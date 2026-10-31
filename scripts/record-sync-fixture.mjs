// Records a real Termix server's /sync/v2 answers for the sync tests.
//
//   node scripts/record-sync-fixture.mjs http://localhost:38080 user password
//
// Use a throwaway server with the Sync plugin on: the script links two
// clients, writes hosts, logins and snippets, and unlinks again. Tokens and
// user ids are replaced, so the file is safe to commit.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [base, username, password] = process.argv.slice(2);
if (!base || !username || !password) {
  console.error(
    "Usage: record-sync-fixture.mjs <server> <username> <password>",
  );
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "tests/fixtures/sync/recorded.json");
const exchanges = [];
const secrets = new Map();

function scrub(value) {
  let text = JSON.stringify(value);
  for (const [secret, label] of secrets) text = text.split(secret).join(label);
  return JSON.parse(text);
}

async function call(
  name,
  method,
  path,
  { token, body, ua = "Termix-Mobile/iOS" } = {},
) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": ua,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  exchanges.push({
    name,
    request: { method, path, body: body ?? null },
    response: {
      status: res.status,
      contentType: res.headers.get("content-type"),
      body: data,
    },
  });
  return { status: res.status, data };
}

async function login(label) {
  const { data } = await call(`login-${label}`, "POST", "/users/login", {
    body: { username, password, rememberMe: true },
  });
  if (!data.token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  secrets.set(data.token, `<login-token-${label}>`);
  return data.token;
}

async function link(label, clientType, deviceId) {
  const loginToken = await login(label);
  const { data } = await call(`link-${label}`, "POST", "/sync/v2/link", {
    token: loginToken,
    body: { deviceName: `Fixture ${label}`, clientType, deviceId },
  });
  secrets.set(data.token, `<device-token-${label}>`);
  secrets.set(data.user.id, "<user-id>");
  return data.token;
}

/** Reads the event stream for a while and returns what came. */
async function listen(token, ms, during) {
  const controller = new AbortController();
  const res = await fetch(`${base}/sync/v2/events`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  });
  let text = "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const reading = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
    } catch {}
  })();
  await during?.();
  await new Promise((r) => setTimeout(r, ms));
  controller.abort();
  await reading;
  return text;
}

const info = await call("info", "GET", "/sync/v2/info?clientType=mobile", {});
if (info.status !== 200) throw new Error("Turn on the Sync plugin first.");

const desktop = await link("desktop", "desktop", "fixture-desktop-1");
const phone = await link("phone", "mobile", "fixture-phone-1");

const ids = {
  credential: "11111111-1111-4111-8111-111111111111",
  folder: "22222222-2222-4222-8222-222222222222",
  jump: "33333333-3333-4333-8333-333333333333",
  host: "44444444-4444-4444-8444-444444444444",
  snippetFolder: "55555555-5555-4555-8555-555555555555",
  snippet: "66666666-6666-4666-8666-666666666666",
};

const hostRow = (name, ip, extra) => ({
  connectionType: "ssh",
  name,
  ip,
  port: 22,
  username: "root",
  folder: "Prod",
  tags: "web,prod",
  pin: false,
  authType: "password",
  password: "host-pass",
  forceKeyboardInteractive: "false",
  jumpHosts: "[]",
  enableSsh: true,
  sshPort: 22,
  statusCheckEnabled: true,
  pluginSettings: {},
  protocolAuth: {},
  ...extra,
});

await call("push-desktop-create", "POST", "/sync/v2/push", {
  token: desktop,
  body: {
    ops: [
      {
        entityType: "sshCredentials",
        syncId: ids.credential,
        baseRevision: 0,
        op: "upsert",
        row: {
          name: "Deploy key",
          authType: "password",
          username: "deploy",
          password: "deploy-pass",
          pin: false,
        },
      },
      {
        entityType: "sshFolders",
        syncId: ids.folder,
        baseRevision: 0,
        op: "upsert",
        row: { name: "Prod", color: "#e11d48", icon: "server" },
      },
      {
        entityType: "hosts",
        syncId: ids.jump,
        baseRevision: 0,
        op: "upsert",
        row: hostRow("bastion", "10.0.0.2", {}),
      },
      {
        entityType: "hosts",
        syncId: ids.host,
        baseRevision: 0,
        op: "upsert",
        row: hostRow("web-1", "10.0.0.5", {
          authType: "credential",
          password: null,
          credentialSyncId: ids.credential,
          jumpHosts: JSON.stringify([{ hostId: ids.jump }]),
          notes: "Main web box",
        }),
      },
      {
        entityType: "snippetFolders",
        syncId: ids.snippetFolder,
        baseRevision: 0,
        op: "upsert",
        row: { name: "Ops", color: null, icon: null },
      },
      {
        entityType: "snippets",
        syncId: ids.snippet,
        baseRevision: 0,
        op: "upsert",
        row: {
          name: "uptime",
          content: "uptime",
          description: "How long it has been up",
          folder: "Ops",
          order: 0,
          isNote: false,
        },
      },
    ],
  },
});

// The phone pulls everything in small pages.
let cursor = 0;
for (let page = 0; page < 20; page++) {
  const { data } = await call(
    `changes-${page}`,
    "GET",
    `/sync/v2/changes?cursor=${cursor}&limit=4`,
    { token: phone },
  );
  cursor = data.nextCursor;
  if (!data.hasMore) break;
}

// The desktop edits a host the phone has seen; the phone then pushes a stale
// edit of it, a write to a read only type and one the server does not know.
const before = exchanges
  .filter((e) => e.name.startsWith("changes-"))
  .flatMap((e) => e.response.body.changes)
  .find((c) => c.syncId === ids.host);
await call("push-desktop-edit", "POST", "/sync/v2/push", {
  token: desktop,
  body: {
    ops: [
      {
        entityType: "hosts",
        syncId: ids.host,
        baseRevision: before.revision,
        op: "upsert",
        row: { ...before.row, notes: "Edited on the desktop" },
      },
    ],
  },
});
await call("push-phone-mixed", "POST", "/sync/v2/push", {
  token: phone,
  body: {
    ops: [
      {
        entityType: "hosts",
        syncId: ids.host,
        baseRevision: before.revision,
        op: "upsert",
        row: { ...before.row, notes: "Edited on the phone" },
      },
      {
        entityType: "accountProfile",
        syncId: "accountProfile:singleton",
        baseRevision: 1,
        op: "upsert",
        row: { username: "nope" },
      },
      {
        entityType: "madeUpType",
        syncId: "x1",
        baseRevision: 0,
        op: "upsert",
        row: { a: 1 },
      },
      {
        entityType: "snippets",
        syncId: ids.snippet,
        baseRevision: exchanges
          .filter((e) => e.name.startsWith("changes-"))
          .flatMap((e) => e.response.body.changes)
          .find((c) => c.syncId === ids.snippet).revision,
        op: "delete",
      },
    ],
  },
});

await call("changes-after", "GET", `/sync/v2/changes?cursor=${cursor}`, {
  token: phone,
});
await call(
  "changes-backfill",
  "GET",
  "/sync/v2/changes?cursor=0&types=snippets,snippetFolders",
  {
    token: phone,
  },
);
await call("host-id", "GET", `/sync/v2/hosts/${ids.host}`, { token: phone });
await call("host-id-missing", "GET", "/sync/v2/hosts/not-a-host", {
  token: phone,
});
await call("refresh", "POST", "/sync/v2/session/refresh", { token: phone });
await call("bad-cursor", "GET", "/sync/v2/changes?cursor=-1", { token: phone });

// Does a push from one device reach another's event stream?
const afterPush = await listen(phone, 4000, () =>
  call("push-desktop-during-events", "POST", "/sync/v2/push", {
    token: desktop,
    body: {
      ops: [
        {
          entityType: "snippetFolders",
          syncId: "77777777-7777-4777-8777-777777777777",
          baseRevision: 0,
          op: "upsert",
          row: { name: "Pushed while listening" },
        },
      ],
    },
  }),
);
exchanges.push({
  name: "events-after-push",
  request: { method: "GET", path: "/sync/v2/events", body: null },
  response: { status: 200, contentType: "text/event-stream", body: afterPush },
});

await call("unlink-phone", "POST", "/sync/v2/unlink", { token: phone });
await call("changes-after-unlink", "GET", "/sync/v2/changes?cursor=0", {
  token: phone,
});
await call("unlink-desktop", "POST", "/sync/v2/unlink", { token: desktop });

mkdirSync(dirname(out), { recursive: true });
const recorded = scrub({
  recordedAt: new Date().toISOString().slice(0, 10),
  server: info.data.version,
  protocol: info.data.protocol,
  exchanges,
});
writeFileSync(out, `${JSON.stringify(recorded, null, 2)}\n`);
console.log(`Wrote ${exchanges.length} exchanges to ${out}`);
