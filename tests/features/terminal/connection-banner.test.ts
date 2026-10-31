import { bannerText, pendingText } from "@/features/terminal/ConnectionBanner";

test("the banner counts down to the next try", () => {
  expect(
    bannerText(
      {
        status: "reconnecting",
        origin: "local",
        attempt: 3,
        nextAt: 10_000,
        reason: "gone",
      },
      6_200,
    ),
  ).toEqual({ title: "Reconnecting in 4s | try 3", detail: "gone" });
  expect(
    bannerText(
      {
        status: "reconnecting",
        origin: "local",
        attempt: 3,
        nextAt: 1_000,
        reason: "gone",
      },
      9_000,
    )?.title,
  ).toBe("Reconnecting in 0s | try 3");
  expect(
    bannerText(
      {
        status: "reconnecting",
        origin: "relay",
        attempt: 1,
        nextAt: null,
        reason: "x",
      },
      0,
    )?.title,
  ).toBe("Reconnecting | try 1");
});

test("offline says it waits; other states show no banner", () => {
  expect(
    bannerText({ status: "offline", origin: "local", reason: "gone" }, 0),
  ).toEqual({ title: "Offline, waiting for network", detail: "gone" });
  expect(
    bannerText({ status: "connected", origin: "local", hasData: true }, 0),
  ).toBeNull();
});

test("typed input waiting is counted plainly", () => {
  expect(pendingText(1, false)).toBe("1 typed character waiting");
  expect(pendingText(12, false)).toBe("12 typed characters waiting");
  expect(pendingText(12, true)).toBe(
    "Send 12 typed characters to the new shell?",
  );
});
