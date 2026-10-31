import { parseMobileContribution } from "@/core/plugins/mobile";

test("reads every field of a webview contribution", () => {
  expect(
    parseMobileContribution({
      mode: "webview",
      entry: "dist/mobile.js",
      sizes: ["phone", "tablet"],
      views: ["databases"],
      note: "Works best on a tablet",
    }),
  ).toEqual({
    mode: "webview",
    entry: "dist/mobile.js",
    sizes: ["phone", "tablet"],
    views: ["databases"],
    note: "Works best on a tablet",
  });
});

test("keeps fields to their own mode", () => {
  expect(
    parseMobileContribution({
      mode: "native",
      feature: "file-manager",
      entry: "dist/mobile.js",
      views: ["x"],
    }),
  ).toEqual({ mode: "native", feature: "file-manager" });
  expect(
    parseMobileContribution({ mode: "webview", feature: "docker" }),
  ).toEqual({ mode: "webview" });
});

test("drops bad parts and never throws", () => {
  expect(
    parseMobileContribution({
      mode: "webview",
      entry: "../escape.js",
      sizes: ["watch", "phone", "phone"],
      views: [1, "", "a", "a"],
      note: "  ",
      extra: true,
    }),
  ).toEqual({ mode: "webview", sizes: ["phone"], views: ["a"] });
  expect(
    parseMobileContribution({ mode: "native", feature: "Bad Id" }),
  ).toEqual({ mode: "native" });
  expect(parseMobileContribution({ mode: "app" })).toBeNull();
  expect(parseMobileContribution("webview")).toBeNull();
  expect(parseMobileContribution(null)).toBeNull();
  expect(parseMobileContribution([])).toBeNull();
});
