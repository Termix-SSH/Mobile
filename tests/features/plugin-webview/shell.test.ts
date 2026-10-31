import { router } from "expo-router";
import type { AccountClient } from "@/core/api/AccountClient";
import { features } from "@/core/features";
import type { FramePlugin } from "@/core/plugins/webview";
import { handleShellCall } from "@/features/plugin-webview/shell";
import { toast } from "@/utils/toast";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    dismissTo: jest.fn(),
    canDismiss: jest.fn(() => true),
  },
}));
jest.mock("@/utils/toast", () => ({
  toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() },
}));
jest.mock("@/core/accounts", () => ({
  accounts: { find: () => ({ id: "s1", kind: "server" }) },
}));
const hosts = [
  { id: 11, serverId: 7, name: "web-01" },
  { id: 12, name: "db-01" },
];
jest.mock("@/core/data/repositories", () => ({
  repositoriesFor: () => ({ hosts: { list: async () => hosts } }),
}));

const plugin: FramePlugin = {
  id: "homepage",
  name: "Homepage",
  entry: "frontend.js",
  frame: { css: false, assetVersion: null, locales: [], contributes: {} },
  views: [
    { view: "homepage", host: false },
    { view: "homepage-host", host: true },
  ],
  fit: "ok",
};

function deps() {
  return {
    client: { accountId: "s1" } as AccountClient,
    plugin,
    navigateToSessions: jest.fn(async () => null),
    showView: jest.fn(),
    close: jest.fn(),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let unregister: () => void;
beforeAll(() => {
  unregister = features.register({
    id: "test-terminal",
    title: "Terminal",
    source: "native",
    sessionTabs: [
      {
        type: "terminal",
        icon: () => null,
        titleSuffix: () => "",
        shortLabel: () => "SSH",
        serverTabTypes: ["terminal"],
        toServerTabType: () => "terminal",
        component: () => null,
      },
    ],
  });
});
afterAll(() => unregister());

test("connectHost finds the phone's copy by the server's id", async () => {
  const d = deps();
  handleShellCall(d, "connectHost", ["7", "terminal"]);
  await flush();
  expect(d.navigateToSessions).toHaveBeenCalledWith(hosts[0], "terminal");
});

test("a host the phone doesn't have says so", async () => {
  const d = deps();
  handleShellCall(d, "connectHost", ["99"]);
  await flush();
  expect(d.navigateToSessions).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalled();
});

test("openTab of the plugin's own views stays in the plugin", async () => {
  const d = deps();
  handleShellCall(d, "openTab", [null, "homepage", { data: { a: 1 } }]);
  await flush();
  expect(d.showView).toHaveBeenCalledWith({ view: "homepage", data: { a: 1 } });

  handleShellCall(d, "openTab", ["12", "homepage-host"]);
  await flush();
  expect(d.navigateToSessions).toHaveBeenCalledWith(
    hosts[1],
    "plugin:homepage:homepage-host",
  );
});

test("openTab of an app tab type opens that tab, unknown types say so", async () => {
  const d = deps();
  handleShellCall(d, "openTab", ["7", "terminal"]);
  await flush();
  expect(d.navigateToSessions).toHaveBeenCalledWith(hosts[0], "terminal");
  handleShellCall(d, "openTab", ["7", "some-desktop-thing"]);
  await flush();
  expect(toast.error).toHaveBeenCalledWith(
    "The app can't open that from here.",
  );
});

test("singleton tabs, close and the host editor", () => {
  const d = deps();
  handleShellCall(d, "openSingletonTab", ["homepage"]);
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/tabs/plugins/[pluginId]",
    params: { pluginId: "homepage", view: "homepage", account: "s1" },
  });
  handleShellCall(d, "closeTab", []);
  expect(d.close).toHaveBeenCalled();
  // From the plugin's own screen it goes back to the tabs, never stacks new ones.
  handleShellCall(d, "openHostEditor", [{}]);
  expect(router.dismissTo).toHaveBeenCalledWith("/(tabs)/hosts");
  handleShellCall(d, "renameTab", ["x"]);
});
