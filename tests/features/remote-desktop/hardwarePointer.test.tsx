import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render } from "@testing-library/react-native";
import { JSDOM, VirtualConsole } from "jsdom";
import { RemoteDesktop } from "@/features/remote-desktop/RemoteDesktop";

// The real bundled guacamole-common-js, with Client.sendMouseState recorded
// instead of sent, since there is no server behind the tunnel.
const mockGuacamoleJs = readFileSync(
  join(__dirname, "../../../assets/guacamole/guacamole-common.js.html"),
  "utf8",
);
const mockRecordMouse = `
;(function () {
  var Real = Guacamole.Client;
  Guacamole.Client = function (tunnel) {
    var c = new Real(tunnel);
    window.__mouse = [];
    c.sendMouseState = function (s) {
      window.__mouse.push({ x: s.x, y: s.y, left: s.left, right: s.right, up: s.up, down: s.down });
    };
    return c;
  };
  Guacamole.Client.State = Real.State;
})();`;

jest.mock("@/features/remote-desktop/loadGuacamoleAssets", () => ({
  loadGuacamoleAssets: async () => mockGuacamoleJs + mockRecordMouse,
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
  useUiColors: () => ({}),
  useTheme: () => ({ isDark: true }),
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockClient = {
  getProxy: () => ({ customHeaders: [], basicAuth: null }),
  clientCert: () => null,
  proxyCookies: () => [],
  api: {
    remoteDesktop: {
      getGuacamoleTokenFromHost: async () => ({ token: "t" }),
    },
  },
  remoteDesktopWebSocketUrl: () => "ws://termix.test/guacamole",
};
jest.mock("@/core/accounts/session", () => ({
  useSessionClient: () => mockClient,
}));
let mockHtml = "";
let mockProps: Record<string, unknown> = {};
jest.mock("react-native-webview", () => ({
  WebView: function WebView(props: { source: { html: string } }) {
    mockHtml = props.source.html;
    mockProps = props;
    return null;
  },
}));

// The window is half the remote size, so remote = view * 2.
let REMOTE_W = 0;
let REMOTE_H = 0;
const pages: JSDOM[] = [];

async function openPage() {
  mockHtml = "";
  await render(
    <RemoteDesktop
      host={{ id: 1, name: "PC", connectionType: "rdp" } as any}
      isVisible
      title="PC"
    />,
  );
  await act(async () => {});
  REMOTE_W = Number(/let remoteW = (\d+);/.exec(mockHtml)?.[1]);
  REMOTE_H = Number(/let remoteH = (\d+);/.exec(mockHtml)?.[1]);

  const errors: Error[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => errors.push(e));
  const dom = new JSDOM(mockHtml, {
    virtualConsole,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window: any) {
      // The bundle ends in module.exports, which only CommonJS has.
      window.module = { exports: {} };
      Object.defineProperty(window, "innerWidth", { value: REMOTE_W / 2 });
      Object.defineProperty(window, "innerHeight", { value: REMOTE_H / 2 });
      // No canvas in jsdom; the display only needs calls to not throw.
      const ctx: any = new Proxy(
        {},
        { get: (_t, k) => (k === "canvas" ? undefined : () => ctx) },
      );
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.WebSocket = class {
        send() {}
        close() {}
      };
    },
  });
  pages.push(dom);
  expect(errors).toEqual([]);
  const win = dom.window as any;
  const el = win.document.getElementById("display") as HTMLElement;
  const mouse = (type: string, x: number, y: number, init: object = {}) =>
    el.dispatchEvent(
      new win.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        ...init,
      }),
    );
  const touch = (type: string, x: number, y: number) => {
    const ev = new win.Event(type, { bubbles: true, cancelable: true });
    const list = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
    Object.assign(ev, {
      touches: list,
      changedTouches: [{ clientX: x, clientY: y }],
    });
    el.dispatchEvent(ev);
  };
  return { win, mouse, touch, sent: () => win.__mouse as any[] };
}

describe("RDP page hardware pointer", () => {
  afterEach(() => pages.splice(0).forEach((dom) => dom.window.close()));

  it("moves the remote mouse on hover", async () => {
    const { mouse, sent } = await openPage();
    mouse("mousemove", 100, 50);
    expect(sent()).toEqual([
      { x: 200, y: 100, left: false, right: false, up: false, down: false },
    ]);
  });

  it("presses and releases the left button where the pointer is", async () => {
    const { mouse, sent } = await openPage();
    mouse("mousemove", 10, 20);
    mouse("mousedown", 10, 20, { button: 0 });
    mouse("mouseup", 10, 20, { button: 0 });
    expect(sent().map((s) => [s.x, s.y, s.left])).toEqual([
      [20, 40, false],
      [20, 40, true],
      [20, 40, false],
    ]);
  });

  it("drags with the button held", async () => {
    const { mouse, sent } = await openPage();
    mouse("mousemove", 10, 10);
    mouse("mousedown", 10, 10, { button: 0 });
    mouse("mousemove", 50, 60, { buttons: 1 });
    mouse("mouseup", 50, 60, { button: 0 });
    expect(sent().map((s) => [s.x, s.y, s.left])).toEqual([
      [20, 20, false],
      [20, 20, true],
      [100, 120, true],
      [100, 120, false],
    ]);
  });

  it("sends a secondary click as the right button", async () => {
    const { mouse, sent } = await openPage();
    mouse("mousemove", 30, 30);
    mouse("mousedown", 30, 30, { button: 2 });
    mouse("mouseup", 30, 30, { button: 2 });
    expect(sent().map((s) => [s.left, s.right])).toEqual([
      [false, false],
      [false, true],
      [false, false],
    ]);
  });

  it("turns the wheel into scroll button clicks", async () => {
    const { win, mouse, sent } = await openPage();
    const el = win.document.getElementById("display");
    mouse("mousemove", 30, 30);
    el.dispatchEvent(
      new win.WheelEvent("wheel", {
        deltaY: 120,
        bubbles: true,
        cancelable: true,
      }),
    );
    const scroll = sent().slice(1);
    expect(scroll[0]).toMatchObject({ x: 60, y: 60, down: true, up: false });
    expect(scroll.at(-1)).toMatchObject({ down: false, up: false });
  });

  it("clamps to the remote screen", async () => {
    const { mouse, sent } = await openPage();
    mouse("mousemove", REMOTE_W, REMOTE_H);
    expect(sent()[0]).toMatchObject({ x: REMOTE_W, y: REMOTE_H });
  });

  it("does not double-click when a finger tap is followed by emulated mouse events", async () => {
    const { mouse, touch, sent } = await openPage();
    touch("touchstart", 40, 40);
    touch("touchend", 40, 40);
    // What a browser that ignores preventDefault would add after the tap.
    mouse("mousemove", 40, 40);
    mouse("mousedown", 40, 40, { button: 0 });
    mouse("mouseup", 40, 40, { button: 0 });
    await new Promise((r) => setTimeout(r, 100));
    expect(sent().filter((s) => s.left)).toHaveLength(1);
  });

  it("keeps the trackpad cursor where the hardware pointer left it", async () => {
    const { win, mouse, touch, sent } = await openPage();
    win.termixRemote.setMouseMode("trackpad");
    mouse("mousemove", 100, 100);
    // A finger tap in trackpad mode clicks at the virtual cursor.
    touch("touchstart", 300, 300);
    touch("touchend", 300, 300);
    const click = sent().find((s) => s.left);
    expect(click).toMatchObject({ x: 200, y: 200 });
  });

  it("cancels the browser default so a held click can't select or drag the page", async () => {
    const { win, mouse } = await openPage();
    mouse("mousemove", 10, 10);
    expect(mouse("mousedown", 10, 10, { button: 0 })).toBe(false);
    expect(mouse("mousemove", 50, 50, { buttons: 1 })).toBe(false);
    expect(mouse("mouseup", 50, 50, { button: 0 })).toBe(false);
    const body = win.getComputedStyle(win.document.body);
    expect(body.getPropertyValue("user-select")).toBe("none");
  });

  it("leaves the web view scroll view on so iPadOS sends trackpad scroll as wheel events", async () => {
    await openPage();
    expect(mockProps.scrollEnabled).not.toBe(false);
    expect(mockProps.bounces).toBe(false);
  });
});
