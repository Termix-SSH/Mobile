import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AccountClient } from "@/core/api/AccountClient";
import type { AppMessage } from "@/core/plugins/frame-protocol";
import type { FramePlugin } from "@/core/plugins/webview";
import { ConfirmProvider } from "@/ui";

import {
  FOLD_REMEASURE_MS,
  PluginWebView,
} from "@/features/plugin-webview/PluginWebView";

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
const mockInject = jest.fn();
jest.mock("react-native-webview", () => {
  const { forwardRef, useImperativeHandle } = require("react");
  const { jsx } = require("react/jsx-runtime");
  const { View } = require("react-native");
  const WebView = forwardRef((props: object, ref: unknown) => {
    useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
    return jsx(View, { ...props, testID: "plugin-web" });
  });
  WebView.displayName = "WebView";
  return { __esModule: true, WebView, default: WebView };
});
let mockFold: unknown = null;
jest.mock("@/utils/window-class", () => {
  const actual = jest.requireActual("@/utils/window-class");
  return {
    ...actual,
    useWindowInfo: () => ({ ...actual.windowInfo(800, 600), fold: mockFold }),
  };
});
// Where the plugin's view sits in the window.
let mockRect = { x: 0, y: 0, width: 800, height: 600 };
const nativeMethods = jest.requireActual(
  "@react-native/jest-preset/jest/MockNativeMethods",
).default;
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

const tree = (shown: FramePlugin) => (
  <ConfirmProvider>
    <PluginWebView
      client={client}
      plugin={shown}
      view={{ view: "alerts" }}
      onShell={jest.fn()}
    />
  </ConfirmProvider>
);

async function show(shown: FramePlugin = plugin) {
  await render(tree(shown));
  await act(async () => {});
}

/** Waits a frame, for measuring, then renders again. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await screen.rerender(tree(plugin));
  await act(async () => {});
}

/** The page says it is up. */
async function pageLoaded() {
  await act(async () => {
    fireEvent(screen.getByTestId("plugin-web"), "message", {
      nativeEvent: {
        url: "https://termix.example/",
        data: JSON.stringify({ t: "loaded", tabs: ["alerts"], panels: [] }),
      },
    });
  });
  await settle();
}

function bundleLoads() {
  mockLoad.mockImplementation(() =>
    Promise.resolve({
      bundle: { code: "", css: null, locales: {} },
      cached: false,
    }),
  );
}

/** Loads the page and has it say it is up. */
async function showReady() {
  bundleLoads();
  await show();
  await pageLoaded();
}

/** The fold messages the app sent into the page. */
function foldsSent() {
  return mockInject.mock.calls
    .map(([code]: [string]) =>
      JSON.parse(code.slice(code.indexOf("(", 22) + 1, code.lastIndexOf(")"))),
    )
    .filter((m: AppMessage) => m.t === "fold")
    .map((m: Extract<AppMessage, { t: "fold" }>) => m.fold);
}

beforeEach(() => {
  mockConnected = true;
  mockLoad.mockReset();
  mockInject.mockReset();
  mockFold = null;
  mockRect = { x: 0, y: 0, width: 800, height: 600 };
  nativeMethods.measureInWindow.mockImplementation(
    (done: (x: number, y: number, w: number, h: number) => void) =>
      done(mockRect.x, mockRect.y, mockRect.width, mockRect.height),
  );
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

test("a screen that doesn't fold never hears about folds", async () => {
  await showReady();
  expect(mockInject).toHaveBeenCalled();
  expect(foldsSent()).toEqual([]);
  expect(nativeMethods.measureInWindow).not.toHaveBeenCalled();
});

test("the page gets the fold in its own coordinates and follows it", async () => {
  // Bent like a book, the plugin beside a 300 point host list.
  mockFold = { axis: "vertical", start: 388, end: 412, active: true };
  mockRect = { x: 300, y: 60, width: 500, height: 540 };
  await showReady();
  expect(foldsSent()).toEqual([
    { axis: "vertical", start: 88, end: 112, active: true },
  ]);

  // Nothing new, nothing sent.
  await settle();
  expect(foldsSent()).toHaveLength(1);

  // Opened flat.
  mockFold = { axis: "vertical", start: 388, end: 412, active: false };
  await settle();
  expect(foldsSent()[1]).toEqual({
    axis: "vertical",
    start: 88,
    end: 112,
    active: false,
  });

  // Turned: the crease now runs across, the page starts lower.
  mockFold = { axis: "horizontal", start: 388, end: 412, active: true };
  await settle();
  expect(foldsSent()[2]).toEqual({
    axis: "horizontal",
    start: 328,
    end: 352,
    active: true,
  });

  // Closed to the outer screen: no fold, so the page is told it is gone.
  mockFold = null;
  await settle();
  expect(foldsSent()).toHaveLength(4);
  expect(foldsSent()[3]).toBeNull();
});

test("a page on one side of the crease is told nothing", async () => {
  mockFold = { axis: "vertical", start: 388, end: 412, active: true };
  mockRect = { x: 412, y: 0, width: 388, height: 600 };
  await showReady();
  expect(foldsSent()).toEqual([]);
});

const book = { axis: "vertical", start: 388, end: 412, active: true };

test("a page still loading is told nothing, then gets the fold once it is up", async () => {
  mockFold = book;
  mockRect = { x: 300, y: 0, width: 500, height: 600 };
  bundleLoads();
  await show();
  await settle();
  expect(foldsSent()).toEqual([]);

  await pageLoaded();
  expect(foldsSent()).toEqual([{ ...book, start: 88, end: 112 }]);
});

test("a layout change measures the page again", async () => {
  mockFold = book;
  mockRect = { x: 300, y: 0, width: 500, height: 600 };
  await showReady();
  expect(foldsSent()).toHaveLength(1);

  // The host list got narrower.
  mockRect = { x: 200, y: 0, width: 600, height: 600 };
  await act(async () => {
    fireEvent(screen.getByTestId("plugin-box"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 600, height: 600 } },
    });
  });
  await settle();
  expect(foldsSent()[1]).toEqual({ ...book, start: 188, end: 212 });
});

test("a crease that moves has the page measured again", async () => {
  mockFold = book;
  mockRect = { x: 300, y: 0, width: 500, height: 600 };
  await showReady();

  // The window moved on the screen: the crease and the page both shifted.
  mockFold = { ...book, start: 488, end: 512 };
  mockRect = { x: 350, y: 0, width: 500, height: 600 };
  // Told the new crease at once, then where the page really is.
  await settle();
  await settle();
  expect(foldsSent().at(-1)).toEqual({ ...book, start: 138, end: 162 });
});

test("a page moved without a layout change is found again", async () => {
  mockFold = book;
  mockRect = { x: 300, y: 0, width: 400, height: 600 };
  await showReady();
  expect(foldsSent()).toEqual([{ ...book, start: 88, end: 112 }]);

  // The split pane changed sides: same size, new place, no layout event.
  mockRect = { x: 380, y: 0, width: 400, height: 600 };
  await settle();
  expect(foldsSent()).toHaveLength(1);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, FOLD_REMEASURE_MS + 50));
  });
  await settle();
  expect(foldsSent()).toHaveLength(2);
  expect(foldsSent()[1]).toEqual({ ...book, start: 8, end: 32 });
});

test("a page that starts over gets the fold again", async () => {
  mockFold = book;
  mockRect = { x: 300, y: 0, width: 500, height: 600 };
  await showReady();
  expect(foldsSent()).toHaveLength(1);

  // The system killed the web view's process.
  await act(async () => {
    fireEvent(screen.getByTestId("plugin-web"), "contentProcessDidTerminate");
  });
  await settle();
  expect(foldsSent()).toHaveLength(1);
  await pageLoaded();
  expect(foldsSent()).toHaveLength(2);
  expect(foldsSent()[1]).toEqual({ ...book, start: 88, end: 112 });
});
