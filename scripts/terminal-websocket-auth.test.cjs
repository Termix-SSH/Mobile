const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const nativeSource = fs.readFileSync(
  path.join(root, "app/tabs/sessions/terminal/NativeWebSocketManager.ts"),
  "utf8",
);
const apiSource = ts.createSourceFile(
  "main-axios.ts",
  fs.readFileSync(path.join(root, "app/main-axios.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const factory = apiSource.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) &&
    node.name?.text === "createTerminalWebSocket",
);
assert.ok(factory, "createTerminalWebSocket must exist");

const compatExports = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(path.join(root, "lib/api-compat.ts"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: compatExports },
);
const { buildTerminalWebSocketUrl } = compatExports;

function fixture(
  serverUrl = "https://termix.example/base/",
  token = "header.payload.signature",
  generation = "legacy",
) {
  const sockets = [];
  const timers = new Map();
  let nextTimer = 0;
  class Socket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      sockets.push(this);
    }
    close() {
      this.readyState = Socket.CLOSED;
    }
  }
  const api = {
    getCurrentServerUrl: () => serverUrl,
    getCookie: async () => token,
    getTerminalWebSocketUrl: (jwt) =>
      serverUrl ? buildTerminalWebSocketUrl(serverUrl, jwt, generation) : null,
  };
  function load(source) {
    const exports = {};
    vm.runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      {
        exports,
        require: (id) => {
          assert.equal(id, "../../../main-axios");
          return api;
        },
        ...api,
        WebSocket: Socket,
        setTimeout: (callback, delay) => {
          const id = ++nextTimer;
          timers.set(id, { callback, delay });
          return id;
        },
        clearTimeout: (id) => timers.delete(id),
        setInterval: () => {
          throw new Error("No live timers in this test");
        },
        clearInterval: () => {},
      },
    );
    return exports;
  }
  const { NativeWebSocketManager } = load(nativeSource);
  const errors = [];
  const manager = new NativeWebSocketManager({
    hostConfig: { id: 1, name: "host" },
    onStateChange: () => {},
    onConnectionFailed: (message) => errors.push(message),
  });
  return {
    sockets,
    timers,
    manager,
    errors,
    factory: load(factory.getText(apiSource)).createTerminalWebSocket,
  };
}

function assertAuthenticated(
  socket,
  token = "header.payload.signature",
  generation = "legacy",
) {
  assert.ok(
    socket.protocols,
    "2.8 requires authentication outside the URL query",
  );
  assert.deepEqual(Array.from(socket.protocols), [`termix.jwt.${token}`]);
  if (generation === "plugin") {
    // 2.9 only reads the subprotocol, so the token stays out of the URL.
    assert.equal(new URL(socket.url).searchParams.get("token"), null);
    assert.equal(
      new URL(socket.url).pathname,
      "/base/plugin-ws/ssh-terminal/terminal",
    );
    return;
  }
  // Retain compatibility with older servers that only accept the URL token.
  assert.equal(new URL(socket.url).searchParams.get("token"), token);
  assert.equal(new URL(socket.url).pathname, "/base/ssh/websocket/");
}

test("native terminal sends the 2.8 auth subprotocol on initial connect", async () => {
  const f = fixture();
  await f.manager.connect(80, 24);
  assert.equal(f.sockets.length, 1);
  assertAuthenticated(f.sockets[0]);
  f.manager.destroy();
  assert.equal(f.timers.size, 0);
});

test("native terminal keeps authentication on automatic reconnect", async () => {
  const f = fixture();
  await f.manager.connect(80, 24);
  const socket = f.sockets[0];
  socket.close();
  socket.onclose({ code: 1006 });
  const retry = [...f.timers.entries()].find(
    ([, timer]) => timer.delay === 1000,
  );
  assert.ok(retry, "unexpected disconnect must schedule a retry");
  f.timers.delete(retry[0]);
  retry[1].callback();
  assert.equal(f.sockets.length, 2);
  assertAuthenticated(f.sockets[1]);
  f.manager.destroy();
  assert.equal(f.timers.size, 0);
});

test("the shared terminal factory sends the same auth subprotocol", async () => {
  const f = fixture("http://termix.example/base/", "different.token.signature");
  const socket = await f.factory();
  assert.equal(new URL(socket.url).protocol, "ws:");
  assertAuthenticated(socket, "different.token.signature");
});

test("2.9 servers get the plugin terminal socket", async () => {
  const f = fixture(
    "https://termix.example/base/",
    "header.payload.signature",
    "plugin",
  );
  await f.manager.connect(80, 24);
  assertAuthenticated(f.sockets[0], "header.payload.signature", "plugin");
  const socket = await f.factory();
  assertAuthenticated(socket, "header.payload.signature", "plugin");
  f.manager.destroy();
});

test("a saved /ssh suffix does not double the socket path", async () => {
  const f = fixture("https://termix.example/ssh");
  const socket = await f.factory();
  assert.equal(new URL(socket.url).pathname, "/ssh/websocket/");
});

for (const token of [undefined, "", "   "]) {
  test(`missing or blank credentials do not open sockets: ${JSON.stringify(token)}`, async () => {
    const f = fixture(
      "https://termix.example/base/",
      token === undefined ? null : token,
    );
    await f.manager.connect(80, 24);
    assert.equal(await f.factory(), null);
    assert.equal(f.sockets.length, 0);
    assert.equal(f.errors.length, 1);
    f.manager.destroy();
  });
}
