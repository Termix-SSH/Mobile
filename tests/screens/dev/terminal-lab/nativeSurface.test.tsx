import { createRef } from "react";
import { render } from "@testing-library/react-native";

import {
  createCallQueue,
  createNativeSurface,
  nativeTheme,
} from "@/screens/dev/terminal-lab/nativeSurface";
import {
  surfaceTheme,
  type TerminalSurfaceHandle,
} from "@/screens/dev/terminal-lab/surface";

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
  const theme = surfaceTheme();
  expect(nativeTheme(theme)).toEqual({
    background: "#0c0d0b",
    foreground: "#f7f7f7",
    cursorColor: "#f7f7f7",
    selectionBackground: "#3a3a3d",
    palette: theme.palette,
  });
  expect(theme.palette).toHaveLength(16);
});

test("unknown theme falls back to the default", () => {
  expect(surfaceTheme("nope").background).toBe(surfaceTheme().background);
});

test("a missing module renders nothing and reports no stats", async () => {
  const { Surface, available } = createNativeSurface("NoSuchModule", "Missing");
  expect(available).toBe(false);
  const ref = createRef<TerminalSurfaceHandle>();
  const screen = await render(
    <Surface
      ref={ref}
      fontSize={14}
      theme={surfaceTheme()}
      onInput={() => {}}
      onResize={() => {}}
    />,
  );
  expect(screen.toJSON()).toBeNull();
  ref.current?.write("AA==");
  await expect(ref.current?.getStats()).resolves.toBeNull();
});
