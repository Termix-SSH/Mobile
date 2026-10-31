import {
  hasExpiredCookie,
  mergeJarCookies,
  missingFromJar,
} from "@/core/api/proxy-cookies";

const saved = [
  { name: "authelia_session", value: "old", expires: 1000 },
  { name: "other", value: "x" },
];

test("takes a renewed value from the jar and keeps our expiry", () => {
  expect(
    mergeJarCookies(saved, [{ name: "authelia_session", value: "new" }]),
  ).toEqual([
    { name: "authelia_session", value: "new", expires: 1000 },
    { name: "other", value: "x" },
  ]);
});

test("a jar expiry wins over ours", () => {
  const next = mergeJarCookies(saved, [
    { name: "authelia_session", value: "new", expires: 5000 },
  ]);
  expect(next?.[0].expires).toBe(5000);
});

test("nothing changed gives null", () => {
  expect(
    mergeJarCookies(saved, [{ name: "authelia_session", value: "old" }]),
  ).toBeNull();
  expect(mergeJarCookies(saved, [])).toBeNull();
});

test("finds cookies the jar lost", () => {
  expect(
    missingFromJar(saved, [{ name: "other", value: "x" }]).map((c) => c.name),
  ).toEqual(["authelia_session"]);
});

test("a cookie past its expiry counts as expired, one with none never does", () => {
  expect(hasExpiredCookie(saved, 999)).toBe(false);
  expect(hasExpiredCookie(saved, 1000)).toBe(true);
  expect(hasExpiredCookie([{ name: "a", value: "b" }], 1e15)).toBe(false);
});
