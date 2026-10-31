import {
  keysymFor,
  keysymForChar,
} from "@/features/remote-desktop/native/keys";

test("android keys map by name, then by the typed character", () => {
  expect(keysymFor({ key: "ENTER", char: 13, down: true })).toBe(0xff0d);
  expect(keysymFor({ key: "DEL", char: 0, down: true })).toBe(0xff08);
  expect(keysymFor({ key: "CTRL_LEFT", char: 0, down: true })).toBe(0xffe3);
  expect(keysymFor({ key: "F5", char: 0, down: true })).toBe(0xffc2);
  expect(keysymFor({ key: "A", char: 65, down: true })).toBe(0x41);
  expect(keysymFor({ key: "UNKNOWN", char: 0, down: true })).toBeNull();
});

test("iOS keys map by HID usage, then by the key text", () => {
  expect(keysymFor({ key: "\r", char: "\r", code: 0x28, down: true })).toBe(
    0xff0d,
  );
  expect(keysymFor({ key: "", char: "", code: 0x50, down: false })).toBe(
    0xff51,
  );
  expect(keysymFor({ key: "", char: "", code: 0x3a, down: true })).toBe(0xffbe);
  expect(keysymFor({ key: "c", char: "\u0003", code: 0x06, down: true })).toBe(
    0x63,
  );
  expect(keysymFor({ key: "", char: "", code: 0x99, down: true })).toBeNull();
});

test("characters past Latin-1 use the Unicode keysym range", () => {
  expect(keysymForChar("é".codePointAt(0)!)).toBe(0xe9);
  expect(keysymForChar("€".codePointAt(0)!)).toBe(0x010020ac);
  expect(keysymForChar(10)).toBe(0xff0d);
});
