import {
  LAPTOP_KEYS_MIN,
  keyRowUnderCrease,
  laptopKeysHeight,
  sessionBarPlacement,
} from "@/screens/sessions/laptop";

// iPhone Duo inner screen bent like a laptop, 669 x 951, crease at 466.5 to 484.5.
const duo = { above: 951 - 466.5, below: 951 - 484.5 };
const keysBar = 40;
const tabBar = 44;

describe("laptopKeysHeight", () => {
  it("leaves room on the bottom half for the session tab bar", () => {
    const keys = laptopKeysHeight(duo, keysBar, tabBar);
    expect(keys + keysBar + tabBar).toBe(duo.below);
  });

  it("fills the half when the tab bar would squeeze the keys", () => {
    const short = { above: 220, below: 200 };
    expect(laptopKeysHeight(short, keysBar, tabBar)).toBe(200 - keysBar);
    const tiny = { above: 180, below: 160 };
    expect(laptopKeysHeight(tiny, keysBar, tabBar)).toBe(LAPTOP_KEYS_MIN);
  });
});

describe("sessionBarPlacement", () => {
  it("puts the tab bar under the crease so the terminal fills the top half", () => {
    const keysTop = keysBar + laptopKeysHeight(duo, keysBar, tabBar);
    expect(sessionBarPlacement(keysTop, tabBar, duo)).toEqual({
      bottom: keysTop,
      margin: duo.above,
    });
  });

  it("keeps the tab bar above the crease when the bottom half is full", () => {
    // A system keyboard that reaches the crease.
    const keysTop = duo.below - 10;
    expect(sessionBarPlacement(keysTop, tabBar, duo)).toEqual({
      bottom: duo.above,
      margin: duo.above + tabBar,
    });
  });

  it("sits on the keys when the screen is flat, as before", () => {
    expect(sessionBarPlacement(300, tabBar, null)).toEqual({
      bottom: 300,
      margin: 344,
    });
  });
});

describe("keyRowUnderCrease", () => {
  const keyRow = 52;

  it("puts the key row right under the crease when the keyboard claims it", () => {
    // What iPhone Duo reports: a keyboard reaching above the crease.
    const bottom = keyRowUnderCrease(495, keyRow, duo);
    expect(bottom).toBe(duo.below - keyRow);
    // The row's top meets the bottom edge of the crease.
    expect(bottom! + keyRow).toBe(duo.below);
  });

  it("leaves the key row on a keyboard that stays below the crease", () => {
    expect(keyRowUnderCrease(300, keyRow, duo)).toBeNull();
  });

  it("does nothing off a laptop fold", () => {
    expect(keyRowUnderCrease(495, keyRow, null)).toBeNull();
  });

  it("leaves the tab bar above the crease once the key row takes the gap", () => {
    expect(sessionBarPlacement(duo.below, tabBar, duo)).toEqual({
      bottom: duo.above,
      margin: duo.above + tabBar,
    });
  });
});
