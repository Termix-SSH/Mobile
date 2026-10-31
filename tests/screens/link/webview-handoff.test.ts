import { readHandoff } from "@/screens/link/webview-handoff";
import { sameOrigin } from "@/utils/origin";

const TOKEN = "header.payload.signature-long-enough";
const msg = (token: unknown) => JSON.stringify({ type: "AUTH_SUCCESS", token });

test("the server's own page hands over its session", () => {
  expect(
    readHandoff(
      msg(TOKEN),
      "https://t.example/oidc/callback?x=1",
      "https://t.example/",
    ),
  ).toEqual({ token: TOKEN });
});

test("another site can't sign the app in", () => {
  expect(
    readHandoff(msg(TOKEN), "https://evil.example/", "https://t.example"),
  ).toBeNull();
  expect(
    readHandoff(msg(TOKEN), "http://t.example/", "https://t.example"),
  ).toBeNull();
  expect(
    readHandoff(msg(TOKEN), "https://t.example:8443/", "https://t.example"),
  ).toBeNull();
  expect(readHandoff(msg(TOKEN), undefined, "https://t.example")).toBeNull();
});

test("short or missing tokens and other messages", () => {
  expect(readHandoff(msg("x"), "https://t.example/", "https://t.example")).toBe(
    "empty",
  );
  expect(
    readHandoff("{}", "https://t.example/", "https://t.example"),
  ).toBeNull();
  expect(
    readHandoff("not json", "https://t.example/", "https://t.example"),
  ).toBeNull();
});

test("same origin handles paths and bad input", () => {
  expect(sameOrigin("https://t.example/a/b", "https://t.example/base/")).toBe(
    true,
  );
  expect(sameOrigin("nope", "https://t.example")).toBe(false);
  expect(sameOrigin(null, "https://t.example")).toBe(false);
});
