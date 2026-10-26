import { shellLayout } from "@/screens/shell/layout";
import { windowInfo } from "@/utils/window-class";

test("phones keep the bottom bar and no host list pane", () => {
  expect(shellLayout(windowInfo(390, 844), 2)).toEqual({
    nav: "bottom",
    hostsPane: false,
    fullScreenSessions: true,
  });
});

test("a phone held sideways gets the rail but no pane", () => {
  expect(shellLayout(windowInfo(852, 393), 2)).toEqual({
    nav: "side",
    hostsPane: false,
    fullScreenSessions: true,
  });
});

test("a medium window gets the sidebar but no pane", () => {
  expect(shellLayout(windowInfo(744, 1133), 2)).toEqual({
    nav: "side",
    hostsPane: false,
    fullScreenSessions: false,
  });
});

test("an expanded window shows the host list beside open sessions", () => {
  expect(shellLayout(windowInfo(1180, 820), 1).hostsPane).toBe(true);
  expect(shellLayout(windowInfo(1180, 820), 0).hostsPane).toBe(false);
});
