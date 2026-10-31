import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AccountClient } from "@/core/api/AccountClient";
import type { FramePlugin } from "@/core/plugins/webview";
import { ConfirmProvider } from "@/ui";

import { PluginWebView } from "@/features/plugin-webview/PluginWebView";

const COLORS = {
  background: "#000000",
  surface: "#000000",
  card: "#000000",
  muted: "#000000",
  active: "#000000",
  border: "#000000",
  text: "#ffffff",
  textMuted: "#888888",
  textFaint: "#444444",
  brand: "#ff8800",
  terminal: "#000000",
};

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
  useUiColors: () => COLORS,
  useTheme: () => ({ isDark: true, resolvedTheme: "dark", accent: "#f59145" }),
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let mockConnected: boolean | undefined = true;
jest.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: mockConnected }),
}));
jest.mock("expo-asset", () => ({
  Asset: { loadAsync: async () => [{ localUri: "file:///host.js" }] },
}));
jest.mock("@/utils/localFile", () => ({
  readLocalText: async () => "/* host */",
}));
const mockLoad = jest.fn();
jest.mock("@/core/plugins/frame-bundle", () => ({
  loadFrameBundle: (...args: unknown[]) => mockLoad(...args),
}));

const plugin: FramePlugin = {
  id: "alerts",
  name: "Alerts",
  icon: "Bell",
  entry: "frontend.js",
  frame: { css: false, assetVersion: "v1", locales: ["en"], contributes: {} },
  views: [{ view: "alerts", host: false }],
  fit: "ok",
};

const client = {
  accountId: "s1",
  rootBase: () => "https://termix.example",
} as unknown as AccountClient;

async function show(shown: FramePlugin = plugin) {
  await render(
    <ConfirmProvider>
      <PluginWebView
        client={client}
        plugin={shown}
        view={{ view: "alerts" }}
        onShell={jest.fn()}
      />
    </ConfirmProvider>,
  );
  await act(async () => {});
}

beforeEach(() => {
  mockConnected = true;
  mockLoad.mockReset();
});

test("shows the plugin's name while it loads", async () => {
  mockLoad.mockReturnValue(
    Promise.resolve({
      bundle: { code: "", css: null, locales: {} },
      cached: false,
    }),
  );
  await show();
  expect(screen.getByText("Alerts")).toBeTruthy();
  expect(mockLoad).toHaveBeenCalledWith(client, plugin);
});

test("offline says so and does not try to load", async () => {
  mockConnected = false;
  await show();
  expect(screen.getByText("You're offline")).toBeTruthy();
  expect(mockLoad).not.toHaveBeenCalled();
});

test("a failed load explains and can try again", async () => {
  mockLoad.mockRejectedValueOnce(new Error("HTTP 500"));
  await show();
  expect(screen.getByText("Can't load Alerts")).toBeTruthy();
  mockLoad.mockReturnValue(new Promise(() => {}));
  await act(async () => {
    fireEvent.press(screen.getByText("Try again"));
  });
  expect(mockLoad).toHaveBeenCalledTimes(2);
});

test("a plugin made for a newer plugin API asks to update the app and never loads", async () => {
  await show({ ...plugin, fit: "update-app" });
  expect(screen.getByText("Update the app")).toBeTruthy();
  expect(mockLoad).not.toHaveBeenCalled();
});

test("a plugin made for an older API major asks to update the plugin", async () => {
  await show({ ...plugin, fit: "update-plugin" });
  expect(screen.getByText("Update the plugin")).toBeTruthy();
  expect(mockLoad).not.toHaveBeenCalled();
});
