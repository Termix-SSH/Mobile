const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const login = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "../lib/rdp-login.ts"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: login },
);

test("2.8 and 2.9 credential-less RDP hosts prompt, with their saved domain", () => {
  for (const host of [
    { rdpAuthType: "none", rdpDomain: "EXAMPLE" },
    {
      protocolAuth: {
        rdp: { authType: "none", fields: { domain: "EXAMPLE" } },
      },
    },
  ]) {
    assert.equal(login.rdpLogin(host, "rdp").prompt, true);
    assert.equal(login.rdpLogin(host, "rdp").domain, "EXAMPLE");
    assert.equal(login.rdpLogin(host, "vnc").prompt, false);
    assert.equal(login.rdpLogin(host, "telnet").prompt, false);
  }
});
test("saved logins and personal overrides connect without a prompt", () => {
  for (const host of [
    {},
    { rdpAuthType: "direct" },
    { rdpAuthType: "credential" },
    { rdpAuthType: "none", protocolAuth: { rdp: { authType: "direct" } } },
    { rdpAuthType: "none", authOverrides: { rdp: { credentialId: 7 } } },
  ])
    assert.equal(login.rdpLogin(host, "rdp").prompt, false);
});
test("an explicitly empty modern domain overrides stale legacy fields", () => {
  assert.equal(
    login.rdpLogin(
      { rdpDomain: "OLD", protocolAuth: { rdp: { fields: { domain: "" } } } },
      "rdp",
    ).domain,
    "",
  );
});
test("the API forwards prompted credentials without changing passwords or empty domains", async () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../app/main-axios.ts"),
    "utf8",
  );
  const start = source.indexOf(
    "export async function getGuacamoleTokenFromHost(",
  );
  const end = source.indexOf("\n}\n", start) + 2;
  assert.ok(start >= 0 && end > start);
  const api = {};
  let sent;
  vm.runInNewContext(
    ts.transpileModule(source.slice(start, end), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports: api,
      remoteDesktopConnectBody: login.remoteDesktopConnectBody,
      authApi: {
        post: async (url, body) => {
          sent = { url, body };
          return { data: { token: "test-token" } };
        },
      },
      handleApiError: (error) => {
        throw error;
      },
    },
  );
  await api.getGuacamoleTokenFromHost(7, "rdp", {
    username: "user",
    password: " test password ",
    domain: "",
  });
  assert.equal(sent.url, "/guacamole/connect-host/7");
  assert.equal(sent.body.promptedUsername, "user");
  assert.equal(sent.body.promptedPassword, " test password ");
  assert.equal(sent.body.promptedDomain, "");
  await api.getGuacamoleTokenFromHost(7, "vnc");
  assert.deepEqual(Object.keys(sent.body), ["protocol"]);
  await api.getGuacamoleTokenFromHost(7);
  assert.deepEqual(Object.keys(sent.body), []);
});
