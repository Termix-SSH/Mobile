import {
  isSecondaryClick,
  menuHeight,
  menuPosition,
  MENU_WIDTH,
} from "@/ui/ContextMenu";

test("a right click or trackpad two finger tap counts, touch does not", () => {
  expect(isSecondaryClick({ button: 2, pointerType: "mouse" })).toBe(true);
  expect(isSecondaryClick({ buttons: 2, pointerType: "mouse" })).toBe(true);
  expect(isSecondaryClick({ button: 0, buttons: 1 })).toBe(false);
  expect(isSecondaryClick({ button: 2, pointerType: "touch" })).toBe(false);
});

test("the menu opens at the pointer when it fits", () => {
  const size = { width: MENU_WIDTH, height: menuHeight(3) };
  expect(
    menuPosition({ x: 100, y: 100 }, size, { width: 1000, height: 800 }),
  ).toEqual({ left: 100, top: 100 });
});

test("the menu flips up and left near the edges", () => {
  const size = { width: MENU_WIDTH, height: menuHeight(3) };
  const pos = menuPosition({ x: 950, y: 780 }, size, {
    width: 1000,
    height: 800,
  });
  expect(pos.left).toBe(950 - MENU_WIDTH);
  expect(pos.top).toBe(780 - size.height);
});

test("the menu never leaves the window on a tiny screen", () => {
  const pos = menuPosition(
    { x: 10, y: 10 },
    { width: MENU_WIDTH, height: 500 },
    { width: 200, height: 300 },
  );
  expect(pos.left).toBeGreaterThanOrEqual(8);
  expect(pos.top).toBeGreaterThanOrEqual(8);
});
