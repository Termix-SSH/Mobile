import {
  attachLine,
  listSessionsCommand,
  listWindowsCommand,
  newSessionName,
  parseSessions,
  parseWindows,
  planTmuxAttach,
  selectWindowKeys,
} from "@/features/terminal/tmux/tmux";
import { sessionDetail } from "@/features/terminal/tmux/TmuxSheets";

test("the plan matches the web terminal's", () => {
  expect(planTmuxAttach(0)).toBe("create");
  expect(planTmuxAttach(1)).toBe("attach");
  expect(planTmuxAttach(3)).toBe("pick");
});

test("sessions and windows parse from tmux's format output", () => {
  expect(
    parseSessions("main|~|3|~|1|~|1700000000\n\nwork|~|1|~|0|~|5\nbroken"),
  ).toEqual([
    { name: "main", windows: 3, attached: 1, activity: 1700000000 },
    { name: "work", windows: 1, attached: 0, activity: 5 },
  ]);
  expect(parseWindows("main|~|0|~|bash|~|1\nmain|~|1|~|vim|~|0\n")).toEqual([
    { session: "main", index: 0, name: "bash", active: true },
    { session: "main", index: 1, name: "vim", active: false },
  ]);
});

test("the list commands find tmux off the normal PATH and say when it is missing", () => {
  const cmd = listSessionsCommand();
  expect(cmd).toContain("/opt/homebrew/bin");
  expect(cmd).toContain("exit 127");
  expect(cmd).toContain("tmux list-sessions -F '#{session_name}|~|");
  expect(listWindowsCommand()).toContain("tmux list-windows -a -F");
});

test("attach lines quote the session name and replace the shell", () => {
  expect(attachLine("main", false)).toMatch(
    /exec tmux attach-session -t '=main'$/,
  );
  expect(attachLine("it's", true)).toMatch(
    /exec tmux new-session -s 'it'\\''s'$/,
  );
});

test("new session names are short and safe", () => {
  expect(newSessionName("ab cd/ef-1234-5678", 36 ** 4 + 10)).toMatch(
    /^termix-abcdef-1-[0-9a-z]{4}$/,
  );
  expect(newSessionName("", 0)).toBe("termix-host-0");
});

test("windows past 9 use tmux's index prompt", () => {
  expect(selectWindowKeys(3)).toBe("3");
  expect(selectWindowKeys(12)).toBe("'12\r");
});

test("the picker says what is in each session", () => {
  expect(sessionDetail({ name: "a", windows: 2, attached: 1 })).toBe(
    "2 windows | 1 attached",
  );
  expect(sessionDetail({ name: "a", windows: 1 })).toBe("1 window");
});
