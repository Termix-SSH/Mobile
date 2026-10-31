import { apiLogger, redactText } from "@/core/log/logger";
import { clearLogs, formatLogs, getLogs } from "@/core/log/buffer";

test("server addresses and queries leave the line, paths stay", () => {
  expect(
    redactText(
      "GET https://termix.example.com:8443/host/db/host?token=abc failed",
    ),
  ).toBe("GET https://<server>/host/db/host failed");
  expect(redactText("socket wss://10.0.0.5/ssh/websocket/?x=1")).toBe(
    "socket wss://<server>/ssh/websocket/",
  );
});

test("host addresses, tokens and passwords are hidden", () => {
  expect(redactText("connect to 192.168.1.20 refused")).toBe(
    "connect to <ip> refused",
  );
  expect(
    redactText("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijkl"),
  ).toBe("jwt [hidden]");
  expect(redactText("Authorization: Bearer abcdef123456")).toBe(
    "Authorization: Bearer [hidden]",
  );
  expect(redactText('{"password":"hunter2","user":"root"}')).toBe(
    '{"password":"[hidden]","user":"root"}',
  );
  expect(redactText("token=xyz&path=/srv")).toBe("token=[hidden]&path=/srv");
});

test("plain lines are left alone", () => {
  expect(redactText("Sync finished in 120 ms, 3 hosts")).toBe(
    "Sync finished in 120 ms, 3 hosts",
  );
});

test("the shareable log never holds the server or a token", () => {
  clearLogs();
  apiLogger.requestStart("get", "https://secret.example/users/me?token=t1");
  apiLogger.error(
    "Request failed",
    new Error("connect ECONNREFUSED 10.1.2.3:443"),
  );
  const text = formatLogs(getLogs());
  expect(text).not.toContain("secret.example");
  expect(text).not.toContain("t1");
  expect(text).not.toContain("10.1.2.3");
  expect(text).toContain("/users/me");
});
