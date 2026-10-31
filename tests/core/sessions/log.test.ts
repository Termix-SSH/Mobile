import { formatConnectionLog } from "@/core/sessions/log";

const at = (h: number, m: number, s: number, ms = 0) =>
  new Date(2026, 9, 24, h, m, s, ms).getTime();

test("the copied log has a header and one line per entry, without the address or user", () => {
  const text = formatConnectionLog(
    [
      {
        id: "1",
        timestamp: at(9, 5, 3, 7),
        level: "info",
        stage: "connection",
        message: "Connecting to Box from this phone",
      },
      {
        id: "2",
        timestamp: at(9, 5, 4, 120),
        level: "warning",
        message: "Connection lost: root@10.0.0.5 reset",
      },
    ],
    {
      appVersion: "2.0.0",
      platform: "android 35",
      hostName: "Box",
      transport: "local",
      state: "reconnecting",
      network: "mobile data",
      lowPower: true,
      redact: [
        { text: "10.0.0.5", as: "<address>" },
        { text: "root", as: "<user>" },
        { text: "", as: "<nothing>" },
      ],
    },
    Date.UTC(2026, 9, 24, 9, 6, 0),
  );
  expect(text.split("\n")).toEqual([
    "Termix Mobile 2.0.0 | android 35",
    "Host: Box | Way: local | State: reconnecting",
    "Network: mobile data | Low power mode",
    "Copied: 2026-10-24T09:06:00.000Z",
    "",
    "09:05:03.007 [INFO connection] Connecting to Box from this phone",
    "09:05:04.120 [WARNING] Connection lost: <user>@<address> reset",
  ]);
});

test("no network line when nothing is known", () => {
  const text = formatConnectionLog([], {
    appVersion: "2.0.0",
    platform: "ios 18",
    hostName: "Box",
    transport: null,
    state: "connected",
  });
  expect(text).toContain("Way: unknown");
  expect(text).not.toContain("Network:");
});
