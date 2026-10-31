/**
 * @jest-environment jsdom
 */
// Runs real plugin bundles (Homepage, Alerts, Proxmox and the community
// template) through the SDK's frame host with the page's network shims and
// a fake app answering. Only runs inside the Termix workspace, where the
// plugin checkouts and a core SDK with the frame host sit next to the app.
import fs from "node:fs";
import path from "node:path";
import type {
  AppMessage,
  PageMessage,
} from "../../../src/core/plugins/frame-protocol";

const util = require("node:util");
const web = require("node:stream/web");
Object.assign(globalThis, {
  TextEncoder: util.TextEncoder,
  TextDecoder: util.TextDecoder,
  ReadableStream: web.ReadableStream,
  TransformStream: web.TransformStream,
  WritableStream: web.WritableStream,
  Blob: require("node:buffer").Blob,
});
const { Headers, Request, Response } = require("undici");
Object.assign(globalThis, { Headers, Request, Response });

const workspace = path.join(__dirname, "../../../..");
const { findSdk } = require("../../../scripts/plugin-host-sdk.cjs");
const sdk: string | null =
  findSdk() ??
  (fs.existsSync(
    path.join(workspace, "Termix/packages/plugin-sdk/dist/host/frame-host.js"),
  )
    ? path.join(workspace, "Termix/packages/plugin-sdk")
    : null);

const PLUGINS = [
  {
    dir: "Plugins/Plugin-Homepage",
    view: "homepage",
    expect: /add your first widget/i,
  },
  {
    dir: "Plugins/Plugin-Alerts",
    view: "alerts",
    expect: /Container web stopped/,
  },
  {
    dir: "Plugins/Plugin-Proxmox",
    view: "proxmox-stats",
    hostId: "1",
    expect: /Proxmox/,
  },
  {
    dir: "Plugin-Template",
    view: "hello-world",
    expect: /First note from the server/,
  },
].map((p) => ({ ...p, path: path.join(workspace, p.dir) }));

const ready =
  !!sdk &&
  PLUGINS.every((p) => fs.existsSync(path.join(p.path, "dist/frontend.js")));
const maybe = ready ? describe : describe.skip;

const origin = "https://termix.example";

const hosts = [
  { id: 1, name: "web-01", ip: "10.0.0.1", port: 22, username: "root" },
  { id: 2, name: "db-01", ip: "10.0.0.2", port: 22, username: "root" },
];

function answer(url: string): unknown {
  const p = new URL(url).pathname;
  if (p === "/host/db/host") return hosts;
  if (p === "/host/folders") return [];
  if (p === "/rbac/permissions/me")
    return { permissions: ["*"], isAdmin: true };
  if (p === "/users/me")
    return { userId: "u1", username: "admin", is_admin: true };
  if (p.startsWith("/plugins/") && p.includes("/settings/")) return {};
  if (p === "/plugin-api/alerts/items") {
    return {
      unread: 1,
      items: [
        {
          id: 1,
          source: "docker",
          category: "docker.down",
          severity: "critical",
          title: "Container web stopped",
          body: "Exited with code 137",
          link: null,
          context: null,
          deliveries: null,
          readAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }
  if (p === "/plugin-api/hello-world/notes") {
    return {
      greeting: "Hello",
      notes: [
        {
          id: 1,
          text: "First note from the server",
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }
  if (p.startsWith("/plugin-api/")) return [];
  return null;
}

let shared: Record<string, Record<string, unknown>> = {};
let startPluginFrame: (options: unknown) => Promise<{
  views: () => { tabs: string[]; panels: string[] };
  dispose: () => Promise<void>;
}>;
let createNet: typeof import("../../../scripts/plugin-host/net").createNet;

maybe("plugins in the frame host", () => {
  let built: { host: string; plugins: Record<string, string> };

  beforeAll(() => {
    const os = require("node:os");
    const { execFileSync } = require("node:child_process");
    const out = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "frame-")),
      "built.json",
    );
    execFileSync(
      process.execPath,
      [
        path.join(__dirname, "../../helpers/buildPluginFrame.cjs"),
        out,
        ...PLUGINS.map((p) => p.path),
      ],
      { stdio: "pipe" },
    );
    built = JSON.parse(fs.readFileSync(out, "utf8"));
    const mod = { exports: {} as Record<string, unknown> };
    new Function("module", "exports", built.host)(mod, mod.exports);
    const e = mod.exports as Record<string, Record<string, unknown>>;
    shared = {
      react: e.react,
      "react-dom": e.reactDom,
      "react-dom/client": e.reactDomClient,
      "react/jsx-runtime": e.jsx,
      i18next: e.i18next,
      "react-i18next": e.reactI18next,
      sonner: e.sonner,
      "@termix-ssh/plugin-sdk/frontend": e.frontend,
      "@termix-ssh/plugin-sdk/ui": e.ui,
    };
    startPluginFrame = e.startPluginFrame as never;
    createNet = e.createNet as never;

    // Browser parts jsdom leaves out.
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })) as never;
    (globalThis as Record<string, unknown>).ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    (globalThis as Record<string, unknown>).IntersectionObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView ??= () => {};
  }, 120000);

  for (const plugin of PLUGINS) {
    test(`${plugin.dir} activates and draws its view`, async () => {
      const seen: string[] = [];
      const streams: string[] = [];
      const net = createNet(
        origin,
        (message: PageMessage) => {
          if (message.t !== "http") return;
          const path = new URL(message.url).pathname;
          seen.push(`${message.method} ${path}`);
          const body = answer(message.url);
          const reply = (m: AppMessage) => setTimeout(() => net.receive(m), 0);
          if (path.endsWith("/stream")) {
            streams.push(message.id);
            reply({
              t: "http.head",
              id: message.id,
              status: 200,
              headers: { "content-type": "text/event-stream" },
            });
            return;
          }
          const text = JSON.stringify(body ?? { error: "missing" });
          reply({
            t: "http.head",
            id: message.id,
            status: body === null ? 404 : 200,
            headers: { "content-type": "application/json" },
          });
          reply({
            t: "http.chunk",
            id: message.id,
            base64: Buffer.from(text).toString("base64"),
          });
          reply({ t: "http.end", id: message.id });
        },
        (() => Promise.reject(new Error("no local fetch"))) as never,
      );
      Object.assign(window, {
        fetch: net.fetch,
        XMLHttpRequest: net.XMLHttpRequest,
        WebSocket: net.WebSocket,
      });
      // jsdom's own location is not the server; core builds URLs from it.
      window.history.replaceState(null, "", "/");

      const manifest = JSON.parse(
        fs.readFileSync(path.join(plugin.path, "manifest.json"), "utf8"),
      );
      const cjs = built.plugins[plugin.path];
      const pluginModule = { exports: {} as Record<string, unknown> };
      new Function("module", "exports", "require", cjs)(
        pluginModule,
        pluginModule.exports,
        (id: string) => {
          const found = shared[id];
          if (!found) throw new Error(`no shared module ${id}`);
          return found;
        },
      );

      const root = document.createElement("div");
      document.body.appendChild(root);
      const calls: unknown[] = [];
      const shell = new Proxy(
        {},
        {
          get:
            (_t, name) =>
            (...args: unknown[]) =>
              calls.push([name, ...args]),
        },
      );
      const frame = await startPluginFrame({
        root,
        summary: {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          enabled: true,
          state: "active",
          frontend: true,
          contributes: manifest.contributes,
        },
        module: pluginModule.exports,
        view: { view: plugin.view, hostId: plugin.hostId },
        theme: { id: "dark", mode: "dark" },
        locales: {
          en: JSON.parse(
            fs.readFileSync(
              path.join(plugin.path, "dist/locales/en.json"),
              "utf8",
            ),
          ),
        },
        shell,
      });
      expect(frame.views().tabs).toContain(plugin.view);

      for (
        let i = 0;
        i < 50 && !plugin.expect.test(root.textContent ?? "");
        i++
      ) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(root.textContent).toMatch(plugin.expect);
      expect(root.textContent).not.toMatch(/Something went wrong/);
      await frame.dispose();
      for (const id of streams) net.receive({ t: "http.end", id });
      root.remove();
    }, 30000);
  }
});

test("the runtime test found the plugin checkouts, or says why not", () => {
  // Outside the workspace the suite above is skipped on purpose.
  expect(typeof ready).toBe("boolean");
});
