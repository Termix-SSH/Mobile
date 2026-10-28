import { shellLayout } from "@/screens/shell/layout";
import { windowInfo } from "@/utils/window-class";

test("phones keep the bottom bar and no host list pane", () => {
  expect(shellLayout(windowInfo(390, 844), 2)).toEqual({
    nav: "bottom",
    hostsPane: false,
    fullScreenSessions: true,
    foldSplit: false,
    laptop: false,
  });
});

test("a phone held sideways gets the rail but no pane", () => {
  expect(shellLayout(windowInfo(852, 393), 2)).toEqual({
    nav: "side",
    hostsPane: false,
    fullScreenSessions: true,
    foldSplit: false,
    laptop: false,
  });
});

test("a medium window gets the sidebar but no pane", () => {
  expect(shellLayout(windowInfo(744, 1133), 2)).toEqual({
    nav: "side",
    hostsPane: false,
    fullScreenSessions: false,
    foldSplit: false,
    laptop: false,
  });
});

test("an expanded window shows the host list beside open sessions", () => {
  expect(shellLayout(windowInfo(1180, 820), 1).hostsPane).toBe(true);
  expect(shellLayout(windowInfo(1180, 820), 0).hostsPane).toBe(false);
});

// iPhone Duo inner screen in points: 951 x 669 open like a book.
const book = (active: boolean) => [
  { x: 475.5, y: 0, width: active ? 18 : 0, height: 669, active },
];
const laptop = (active: boolean) => [
  { x: 0, y: 475.5, width: 669, height: active ? 18 : 0, active },
];

test("a book fold puts the host list on the left half, flat or bent", () => {
  for (const active of [false, true]) {
    const l = shellLayout(windowInfo(951, 669, book(active)), 1);
    expect(l.foldSplit).toBe(true);
    expect(l.hostsPane).toBe(true);
    expect(l.laptop).toBe(false);
  }
  expect(shellLayout(windowInfo(951, 669, book(true)), 0).hostsPane).toBe(
    false,
  );
});

test("a narrow book fold like a Galaxy Fold still splits", () => {
  const folds = [{ x: 336, y: 0, width: 0, height: 841, active: false }];
  const l = shellLayout(windowInfo(673, 841, folds), 2);
  expect(l.nav).toBe("side");
  expect(l.hostsPane).toBe(true);
});

test("a fold too far to one side keeps the normal layout", () => {
  const folds = [{ x: 200, y: 0, width: 0, height: 841, active: false }];
  const l = shellLayout(windowInfo(673, 841, folds), 2);
  expect(l.foldSplit).toBe(false);
  expect(l.hostsPane).toBe(false);
});

test("laptop mode only while bent with the crease across", () => {
  expect(shellLayout(windowInfo(669, 951, laptop(true)), 1).laptop).toBe(true);
  expect(shellLayout(windowInfo(669, 951, laptop(false)), 1).laptop).toBe(
    false,
  );
  expect(shellLayout(windowInfo(669, 951, laptop(true)), 1).hostsPane).toBe(
    false,
  );
});
