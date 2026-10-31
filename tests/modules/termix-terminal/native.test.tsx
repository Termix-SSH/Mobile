import { createRef } from "react";
import { render } from "@testing-library/react-native";

import {
  TerminalView,
  isTerminalEngineAvailable,
  type TerminalViewHandle,
} from "@/modules/termix-terminal";

// A build with the engine: the native view is a stand-in that records its props
// and hands out a fake native handle.
const mockNative: {
  props: Record<string, any>;
  handle: Record<string, jest.Mock>;
} = { props: {}, handle: {} };

jest.mock("expo-modules-core", () => ({
  ...jest.requireActual("expo-modules-core"),
  requireOptionalNativeModule: () => ({ engineLoaded: true }),
}));

jest.mock("expo", () => {
  const React = require("react");
  return {
    requireNativeView: () =>
      React.forwardRef(function NativeTerminal(
        props: Record<string, any>,
        ref: any,
      ) {
        mockNative.props = props;
        React.useImperativeHandle(ref, () => mockNative.handle);
        return null;
      }),
  };
});

const theme = {
  background: "#000000",
  foreground: "#ffffff",
  cursor: "#ffffff",
  cursorAccent: "#000000",
  selectionBackground: "#333333",
  palette: [],
};

const ev = (nativeEvent: object) => ({ nativeEvent });

beforeEach(() => {
  mockNative.props = {};
  mockNative.handle = Object.fromEntries(
    [
      "write",
      "paste",
      "scrollToBottom",
      "copySelection",
      "selectAll",
      "focus",
      "blur",
      "toggleModifier",
      "sendKey",
      "typeText",
      "answerClipboard",
      "getStats",
      "search",
      "searchNext",
      "searchPrevious",
      "clearSearch",
    ].map((name) => [name, jest.fn(async () => undefined)]),
  );
});

test("the engine is there in this build", () => {
  expect(isTerminalEngineAvailable).toBe(true);
});

test("passes the look to the native view", async () => {
  await render(
    <TerminalView
      pipeId="p1"
      fontSize={15}
      fontFamily="JetBrainsMono NFM"
      lineHeight={1.2}
      cursor={{ style: "bar", blink: false }}
      bell={{ style: "visual", haptics: true }}
      theme={theme}
      onInput={() => {}}
      onResize={() => {}}
    />,
  );
  expect(mockNative.props).toMatchObject({
    pipeId: "p1",
    fontSize: 15,
    fontFamily: "JetBrainsMono NFM",
    lineHeight: 1.2,
    cursor: { style: "bar", blink: false },
    bell: { style: "visual", haptics: true },
    theme: { cursorColor: "#ffffff", cursorAccent: "#000000" },
  });
});

test("no pipe is sent as null so the view reads from write", async () => {
  await render(
    <TerminalView
      fontSize={14}
      theme={theme}
      onInput={() => {}}
      onResize={() => {}}
    />,
  );
  expect(mockNative.props.pipeId).toBeNull();
});

test("calls wait for the first size, then reach the native handle", async () => {
  const ref = createRef<TerminalViewHandle>();
  const onResize = jest.fn();
  await render(
    <TerminalView
      ref={ref}
      fontSize={14}
      theme={theme}
      onInput={() => {}}
      onResize={onResize}
    />,
  );
  ref.current!.sendKey("Tab");
  ref.current!.toggleModifier("ctrl");
  expect(mockNative.handle.sendKey).not.toHaveBeenCalled();

  mockNative.props.onResize(ev({ cols: 80, rows: 24 }));
  expect(onResize).toHaveBeenCalledWith(80, 24);
  expect(mockNative.handle.sendKey).toHaveBeenCalledWith("Tab", false);
  expect(mockNative.handle.toggleModifier).toHaveBeenCalledWith("ctrl");

  ref.current!.sendKey("ArrowUp", true);
  ref.current!.typeText("|");
  ref.current!.answerClipboard(3, true);
  expect(mockNative.handle.sendKey).toHaveBeenLastCalledWith("ArrowUp", true);
  expect(mockNative.handle.typeText).toHaveBeenCalledWith("|");
  expect(mockNative.handle.answerClipboard).toHaveBeenCalledWith(3, true);
});

test("native events become plain callbacks", async () => {
  const handlers = {
    onInput: jest.fn(),
    onScrollState: jest.fn(),
    onLink: jest.fn(),
    onCopy: jest.fn(),
    onClipboardRequest: jest.fn(),
    onFontSize: jest.fn(),
    onModifiers: jest.fn(),
    onTitle: jest.fn(),
    onBell: jest.fn(),
  };
  await render(
    <TerminalView
      fontSize={14}
      theme={theme}
      onResize={() => {}}
      {...handlers}
    />,
  );
  const p = mockNative.props;
  p.onInput(ev({ data: "bHM=" }));
  p.onScrollState(ev({ atBottom: false }));
  p.onLink(ev({ url: "https://termix.site" }));
  p.onCopy(ev({ text: "hi", fromProgram: true }));
  p.onClipboardRequest(ev({ id: 2, kind: "read", text: "" }));
  p.onFontSize(ev({ size: 16 }));
  p.onModifiers(ev({ ctrl: "armed", alt: "inactive" }));
  p.onTitleChange(ev({ title: "vim" }));
  p.onBell(ev({}));

  expect(handlers.onInput).toHaveBeenCalledWith("bHM=");
  expect(handlers.onScrollState).toHaveBeenCalledWith(false);
  expect(handlers.onLink).toHaveBeenCalledWith("https://termix.site");
  expect(handlers.onCopy).toHaveBeenCalledWith("hi", true);
  expect(handlers.onClipboardRequest).toHaveBeenCalledWith({
    id: 2,
    kind: "read",
    text: "",
  });
  expect(handlers.onFontSize).toHaveBeenCalledWith(16);
  expect(handlers.onModifiers).toHaveBeenCalledWith({
    ctrl: "armed",
    alt: "inactive",
  });
  expect(handlers.onTitle).toHaveBeenCalledWith("vim");
  expect(handlers.onBell).toHaveBeenCalled();
});

test("search calls reach the native view with every option set", async () => {
  const ref = createRef<TerminalViewHandle>();
  await render(
    <TerminalView
      ref={ref}
      fontSize={14}
      theme={theme}
      onInput={() => {}}
      onResize={() => {}}
    />,
  );
  mockNative.props.onResize(ev({ cols: 80, rows: 24 }));
  ref.current!.search("error", { regex: true });
  ref.current!.searchNext();
  ref.current!.searchPrevious();
  ref.current!.clearSearch();
  expect(mockNative.handle.search).toHaveBeenCalledWith("error", {
    caseSensitive: false,
    wholeWord: false,
    regex: true,
  });
  expect(mockNative.handle.searchNext).toHaveBeenCalled();
  expect(mockNative.handle.searchPrevious).toHaveBeenCalled();
  expect(mockNative.handle.clearSearch).toHaveBeenCalled();
});

test("prompt lines and search results come back as plain callbacks", async () => {
  const onPromptLine = jest.fn();
  const onSearch = jest.fn();
  const onMenu = jest.fn();
  const onShortcut = jest.fn();
  await render(
    <TerminalView
      fontSize={14}
      theme={theme}
      watchPrompt
      onInput={() => {}}
      onResize={() => {}}
      onPromptLine={onPromptLine}
      onSearch={onSearch}
      onMenu={onMenu}
      onShortcut={onShortcut}
    />,
  );
  expect(mockNative.props.watchPrompt).toBe(true);
  mockNative.props.onPromptLine(ev({ line: "Password:" }));
  mockNative.props.onSearch(ev({ total: 4, index: 3 }));
  expect(onPromptLine).toHaveBeenCalledWith("Password:");
  expect(onSearch).toHaveBeenCalledWith({ total: 4, index: 3 });
  mockNative.props.onMenu(ev({}));
  expect(onMenu).toHaveBeenCalled();
  mockNative.props.onShortcut(ev({ id: "newTab" }));
  expect(onShortcut).toHaveBeenCalledWith("newTab");
});
