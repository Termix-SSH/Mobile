import {
  keyTarget,
  normalizePin,
  parsePins,
  pinMismatch,
} from "@/core/api/pins";

const A = "A".repeat(43) + "=";
const B = "B".repeat(43) + "=";

test("a pin is 32 bytes of base64, with or without sha256/", () => {
  expect(normalizePin(A)).toBe(A);
  expect(normalizePin(` sha256/${A} `)).toBe(A);
  expect(normalizePin("abc")).toBeNull();
  expect(normalizePin(A.slice(1))).toBeNull();
});

test("pasted pins split on lines and commas, without repeats", () => {
  expect(parsePins(`${A}\n${B}, ${A}`)).toEqual({ pins: [A, B], bad: [] });
  expect(parsePins(`${A}\nnope`)).toEqual({ pins: [A], bad: ["nope"] });
});

test("the key is read from the server's host and port", () => {
  expect(keyTarget("https://t.example/base/")).toEqual({
    host: "t.example",
    port: 443,
  });
  expect(keyTarget("https://10.0.0.5:8443")).toEqual({
    host: "10.0.0.5",
    port: 8443,
  });
});

test("a failure is the pin only when the server shows another key", async () => {
  const peek = (pin: string) => async () => ({ pin });
  expect(await pinMismatch("https://t.example", [A], peek(B))).toBe(true);
  expect(await pinMismatch("https://t.example", [A, B], peek(B))).toBe(false);
  expect(await pinMismatch("https://t.example", [], peek(B))).toBe(false);
  const offline = async () => {
    throw new Error("unreachable");
  };
  expect(await pinMismatch("https://t.example", [A], offline)).toBe(false);
});
