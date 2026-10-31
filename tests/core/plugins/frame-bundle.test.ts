import * as FileSystem from "expo-file-system";
import type { AccountClient } from "@/core/api/AccountClient";
import {
  assetUrl,
  clearFrameCache,
  loadFrameBundle,
  pickLocale,
  resetFrameMemory,
} from "@/core/plugins/frame-bundle";
import type { FramePlugin } from "@/core/plugins/webview";

jest.mock("expo-file-system", () =>
  require("../../helpers/fakeFileSystem").fakeFileSystem(),
);

const files = (FileSystem as unknown as { __files: Map<string, Uint8Array> })
  .__files;

const plugin: FramePlugin = {
  id: "alerts",
  name: "Alerts",
  entry: "frontend.js",
  frame: {
    css: true,
    assetVersion: "abc",
    locales: ["en", "de_DE"],
    contributes: {},
  },
  views: [{ view: "alerts", host: false }],
  fit: "ok",
};

function client(serve: Record<string, string> | Error) {
  const seen: { url: string; headers: unknown }[] = [];
  const c = {
    accountId: "acc-1",
    rootBase: () => "https://termix.example/sub",
    sessionHeaders: () => ({ Authorization: "Bearer t" }),
    fetch: jest.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers });
      if (serve instanceof Error) throw serve;
      const path = new URL(url).pathname;
      const body = serve[path];
      return body === undefined
        ? new Response("", { status: 404 })
        : new Response(body, { status: 200 });
    }),
  } as unknown as AccountClient;
  return { c, seen };
}

const served = {
  "/sub/plugin-assets/alerts/frontend.js": "export function activate() {}",
  "/sub/plugin-assets/alerts/frontend.css": ".a{}",
  "/sub/plugin-assets/alerts/locales/en.json": '{"nav":{"alerts":"Alerts"}}',
  "/sub/plugin-assets/alerts/locales/translated/de_DE.json":
    '{"nav":{"alerts":"Meldungen"}}',
};

beforeEach(() => {
  resetFrameMemory();
  files.clear();
});

test("loads code, styles and strings through the account's client", async () => {
  const { c, seen } = client(served);
  const { bundle, cached } = await loadFrameBundle(c, plugin, "de-DE");
  expect(cached).toBe(false);
  expect(bundle).toEqual({
    code: "export function activate() {}",
    css: ".a{}",
    locales: {
      language: "de_DE",
      en: { nav: { alerts: "Alerts" } },
      translated: { nav: { alerts: "Meldungen" } },
    },
  });
  expect(seen.map((s) => s.url)).toContain(
    "https://termix.example/sub/plugin-assets/alerts/frontend.js?v=abc",
  );
  expect(seen[0].headers).toEqual({ Authorization: "Bearer t" });
});

test("the same version comes from memory, and from disk when offline", async () => {
  const online = client(served);
  await loadFrameBundle(online.c, plugin, "en-US");
  const again = await loadFrameBundle(online.c, plugin, "en-US");
  expect(again.cached).toBe(false);
  expect(online.seen).toHaveLength(3);

  resetFrameMemory();
  const offline = client(new Error("Network request failed"));
  const fromDisk = await loadFrameBundle(offline.c, plugin, "en-US");
  expect(fromDisk.cached).toBe(true);
  expect(fromDisk.bundle.code).toBe("export function activate() {}");

  clearFrameCache("acc-1");
  resetFrameMemory();
  await expect(loadFrameBundle(offline.c, plugin, "en-US")).rejects.toThrow(
    "Network request failed",
  );
});

test("a missing entry is an error, missing strings and styles are not", async () => {
  const { c } = client({
    "/sub/plugin-assets/alerts/frontend.js": "x",
  });
  const { bundle } = await loadFrameBundle(c, plugin, "en");
  expect(bundle).toEqual({
    code: "x",
    css: null,
    locales: { language: undefined, en: undefined, translated: undefined },
  });
  resetFrameMemory();
  await expect(loadFrameBundle(client({}).c, plugin, "en")).rejects.toThrow(
    "Alerts has no frontend.js",
  );
});

test("locale and URL helpers", () => {
  expect(pickLocale(["en", "de_DE", "pt_BR"], "de-AT")).toBe("de_DE");
  expect(pickLocale(["en", "pt_BR"], "pt_BR")).toBe("pt_BR");
  expect(pickLocale(["en", "de_DE"], "en-GB")).toBeUndefined();
  expect(pickLocale(["en"], "fr-FR")).toBeUndefined();
  const { c } = client({});
  expect(
    assetUrl(
      c,
      { ...plugin, frame: { ...plugin.frame, assetVersion: null } },
      "a.css",
    ),
  ).toBe("https://termix.example/sub/plugin-assets/alerts/a.css");
});
