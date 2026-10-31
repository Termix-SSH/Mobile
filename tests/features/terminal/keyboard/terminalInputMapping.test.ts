import {
  isDuplicateTerminalSpecialKey,
  makeTerminalSpecialKeyRecord,
  translateCommittedText,
  translateSpecialKeyEvent,
} from "@/features/terminal/keyboard/terminalInputMapping";

const none = { ctrl: false, alt: false, shift: false };
const key = (k: string, mods: Partial<typeof none> = {}) => ({
  key: k,
  ...none,
  ...mods,
  source: "native-ime" as const,
});

describe("translateCommittedText", () => {
  test("plain text passes through", () => {
    expect(translateCommittedText("ls -la", none)).toBe("ls -la");
    expect(translateCommittedText("日本", { ...none, ctrl: true })).toBe(
      "日本",
    );
  });

  test("Ctrl, Alt and Shift change one character", () => {
    expect(translateCommittedText("c", { ...none, ctrl: true })).toBe("\x03");
    expect(translateCommittedText("b", { ...none, alt: true })).toBe("\x1bb");
    expect(translateCommittedText("a", { ...none, shift: true })).toBe("A");
    expect(translateCommittedText("ab", { ...none, ctrl: true })).toBe("ab");
  });
});

describe("translateSpecialKeyEvent", () => {
  test("named keys and their shifted forms", () => {
    expect(translateSpecialKeyEvent(key("Enter"))).toBe("\r");
    expect(translateSpecialKeyEvent(key("\t"))).toBe("\t");
    expect(translateSpecialKeyEvent(key("Tab", { shift: true }))).toBe(
      "\x1b[Z",
    );
    expect(translateSpecialKeyEvent(key("ArrowUp", { shift: true }))).toBe(
      "\x1b[1;2A",
    );
    expect(translateSpecialKeyEvent(key("F5"))).toBe("\x1b[15~");
    expect(translateSpecialKeyEvent(key("Nope"))).toBeNull();
  });

  test("Ctrl and Alt with a character", () => {
    expect(translateSpecialKeyEvent(key("l", { ctrl: true }))).toBe("\x0c");
    expect(translateSpecialKeyEvent(key("x", { alt: true, shift: true }))).toBe(
      "\x1bX",
    );
  });
});

test("the same key from two sources inside the window counts once", () => {
  const first = makeTerminalSpecialKeyRecord(key("Tab"), 1000);
  const fromKeyCommand = { ...key("Tab"), source: "ios-keycommand" as const };
  expect(isDuplicateTerminalSpecialKey(first, fromKeyCommand, 1020)).toBe(true);
  expect(isDuplicateTerminalSpecialKey(first, fromKeyCommand, 1100)).toBe(
    false,
  );
  expect(isDuplicateTerminalSpecialKey(first, key("Tab"), 1010)).toBe(false);
  expect(isDuplicateTerminalSpecialKey(null, key("Tab"), 1010)).toBe(false);
});
