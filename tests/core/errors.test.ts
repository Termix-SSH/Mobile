import axios from "axios";
import { AppError, toUserMessage } from "@/core/errors";
import {
  ApiError,
  extractConnectionLogs,
  handleApiError,
} from "@/core/api/errors";

function httpError(status: number, data: unknown, url = "/thing") {
  return new axios.AxiosError(
    "HTTP",
    "ERR",
    { url, headers: {} } as any,
    null,
    {
      status,
      data,
      statusText: "",
      headers: {},
      config: {} as any,
    },
  );
}

const hooks = () => ({
  onAuthLost: jest.fn(),
  refreshEnabledPlugins: jest.fn(async () => {}),
});

test("API errors are app errors with a code and status", () => {
  const e = new ApiError("Nope", 404, "NOT_FOUND");
  expect(e).toBeInstanceOf(AppError);
  expect([e.code, e.status, toUserMessage(e)]).toEqual([
    "NOT_FOUND",
    404,
    "Nope",
  ]);
});

test("toUserMessage falls back for things that are not errors", () => {
  expect(toUserMessage(new AppError("Shown"))).toBe("Shown");
  expect(toUserMessage(new Error("Plain"))).toBe("Plain");
  expect(toUserMessage(undefined, "Fallback")).toBe("Fallback");
});

test("a 401 on a critical endpoint ends the session, others do not", () => {
  const h = hooks();
  expect(() => handleApiError(h, httpError(401, {}, "/users/me"), "x")).toThrow(
    ApiError,
  );
  expect(h.onAuthLost).toHaveBeenCalledTimes(1);
  expect(() => handleApiError(h, httpError(401, {}, "/snippets"), "x")).toThrow(
    "Authentication required",
  );
  expect(h.onAuthLost).toHaveBeenCalledTimes(1);
});

test("a proxy login page on a 401 never ends the session", () => {
  const h = hooks();
  expect(() =>
    handleApiError(h, httpError(401, "<html>sign in</html>", "/users/me"), "x"),
  ).toThrow(expect.objectContaining({ code: "PROXY_LOGIN" }));
  expect(h.onAuthLost).not.toHaveBeenCalled();
});

test("a plugin that is off refreshes the feature list", () => {
  const h = hooks();
  try {
    handleApiError(h, httpError(503, { pluginId: "docker" }), "x");
  } catch (e) {
    expect((e as ApiError).code).toBe("FEATURE_DISABLED");
  }
  expect(h.refreshEnabledPlugins).toHaveBeenCalled();
});

test("app errors pass through unchanged", () => {
  const original = new AppError("Already handled", "NO_SERVER");
  expect(() => handleApiError(hooks(), original, "x")).toThrow(original);
});

test("connection logs are read from responses and errors", () => {
  const logs = [{ type: "info", message: "Connecting" }];
  expect(extractConnectionLogs({ connectionLogs: logs })).toEqual(logs);
  expect(
    extractConnectionLogs(httpError(500, { connectionLogs: logs })),
  ).toEqual(logs);
  expect(extractConnectionLogs(null)).toEqual([]);
});
