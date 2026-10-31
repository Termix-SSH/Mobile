import { createRef } from "react";
import { render } from "@testing-library/react-native";

import {
  TerminalView,
  createCallQueue,
  isTerminalEngineAvailable,
  nativeTheme,
  type TerminalViewHandle,
} from "@/modules/termix-terminal";
import { TERMINAL_THEMES } from "@/constants/terminal-themes";
import { nativeTheme as terminalTheme } from "@/features/terminal/settings";

const theme = terminalTheme(TERMINAL_THEMES.termix.colors);

test("queued calls run once the view is ready, in order", () => {
  const q = createCallQueue();
  const calls: number[] = [];
  q.run(() => calls.push(1));
  q.run(() => calls.push(2));
  expect(calls).toEqual([]);
  expect(q.ready).toBe(false);
  q.markReady();
  q.markReady();
  expect(calls).toEqual([1, 2]);
  q.run(() => calls.push(3));
  expect(calls).toEqual([1, 2, 3]);
});

test("theme maps to the native record", () => {
  expect(nativeTheme(theme)).toEqual({
    background: "#0c0d0b",
    foreground: "#f7f7f7",
    cursorColor: "#f7f7f7",
    cursorAccent: "#0c0d0b",
    selectionBackground: "#3a3a3d",
    palette: theme.palette,
  });
  expect(theme.palette).toHaveLength(16);
});

test("without the native module it renders nothing and reports no stats", async () => {
  expect(isTerminalEngineAvailable).toBe(false);
  const ref = createRef<TerminalViewHandle>();
  const screen = await render(
    <TerminalView
      ref={ref}
      fontSize={14}
      theme={theme}
      onInput={() => {}}
      onResize={() => {}}
    />,
  );
  expect(screen.toJSON()).toBeNull();
  ref.current?.write("AA==");
  await expect(ref.current?.getStats()).resolves.toBeNull();
});
