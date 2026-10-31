import {
  findScreen,
  listScreensCommand,
  parseScreens,
  planScreen,
  screenAttachLine,
} from "@/features/terminal/tmux/screen";

const LS = `There are screens on:
\t12345.termix-box-ab12\t(10/24/2026 09:00:01 AM)\t(Detached)
\t678.work\t(Attached)
\t91.shared\t(Multi, attached)
3 Sockets in /run/screen/S-root.
`;

test("screen -ls output is read", () => {
  expect(parseScreens(LS)).toEqual([
    { id: "12345.termix-box-ab12", name: "termix-box-ab12", attached: false },
    { id: "678.work", name: "work", attached: true },
    { id: "91.shared", name: "shared", attached: true },
  ]);
  expect(parseScreens("No Sockets found in /run/screen/S-root.\n")).toEqual([]);
});

test("reattach the first free session, else start one", () => {
  const sessions = parseScreens(LS);
  expect(planScreen(sessions, "termix-new")).toEqual({
    create: false,
    target: "12345.termix-box-ab12",
  });
  expect(planScreen(sessions.slice(1), "termix-new")).toEqual({
    create: true,
    target: "termix-new",
  });
});

test("a session is found again by name or id", () => {
  const sessions = parseScreens(LS);
  expect(findScreen(sessions, "termix-box-ab12")?.id).toBe(
    "12345.termix-box-ab12",
  );
  expect(findScreen(sessions, "678.work")?.name).toBe("work");
  expect(findScreen(sessions, "nope")).toBeUndefined();
});

test("commands quote names and exit 127 when screen is missing", () => {
  expect(listScreensCommand()).toContain("exit 127");
  expect(screenAttachLine("it's", true)).toContain(`exec screen -S 'it'\\''s'`);
  expect(screenAttachLine("1.work", false)).toContain(
    "exec screen -d -r '1.work'",
  );
});
