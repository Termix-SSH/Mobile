import { createLogger, describeError, redact } from "@/core/log/logger";

test("redact hides anything that looks like a secret", () => {
  expect(
    redact({
      operation: "login",
      password: "hunter2",
      headers: { Authorization: "Bearer x", Accept: "json" },
      nested: [{ token: "t", keep: 1 }],
      sshKey: "-----BEGIN",
      empty: null,
    }),
  ).toEqual({
    operation: "login",
    password: "[hidden]",
    headers: { Authorization: "[hidden]", Accept: "json" },
    nested: [{ token: "[hidden]", keep: 1 }],
    sshKey: "[hidden]",
    empty: null,
  });
  expect(redact("plain")).toBe("plain");
});

test("request errors are logged without their config", () => {
  const error = {
    isAxiosError: true,
    message: "Request failed",
    code: "ERR_BAD_RESPONSE",
    config: { headers: { Authorization: "Bearer secret" } },
    response: { status: 500, data: { error: "boom", token: "t" } },
  };
  expect(describeError(error)).toEqual({
    message: "Request failed",
    code: "ERR_BAD_RESPONSE",
    status: 500,
    data: { error: "boom", token: "[hidden]" },
  });
});

test("scoped loggers never print secrets from their context", () => {
  const spy = jest.spyOn(console, "log").mockImplementation(() => {});
  createLogger("accounts").info("linked", { password: "pw" } as any);
  expect(spy.mock.calls.flat().join(" ")).not.toContain("pw");
  spy.mockRestore();
});
