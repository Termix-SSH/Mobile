import {
  CommandLineTracker,
  isSensitiveCommand,
  suggestCommands,
} from "@/features/terminal/history/capture";
import { filterHistory } from "@/features/terminal/history/filter";

function tracker(password = false) {
  const lines: [string, boolean][] = [];
  const t = new CommandLineTracker({
    onSubmit: (line, save) => lines.push([line, save]),
    isPasswordInput: () => password,
  });
  return { t, lines };
}

test("submits the typed line on Enter, with backspace applied", () => {
  const { t, lines } = tracker();
  t.track("lss");
  t.track("\x7f -la\r");
  expect(lines).toEqual([["ls -la", true]]);
  expect(t.current()).toBe("");
});

test("escape sequences, arrows and bracketed paste markers are skipped", () => {
  const { t, lines } = tracker();
  t.track("\x1b[A\x1bOB\x1b[200~echo hi\x1b[201~\x1bb\r");
  expect(lines).toEqual([["echo hi", true]]);
});

test("Ctrl-C, Ctrl-D and Ctrl-U drop the line", () => {
  const { t, lines } = tracker();
  t.track("rm -rf /\x03");
  t.track("abc\x15");
  t.track("x\x04\r");
  expect(lines).toEqual([]);
});

test("secret looking lines are flagged and password prompts dropped", () => {
  const { t, lines } = tracker();
  t.track("export API_TOKEN=abc\r");
  expect(lines).toEqual([["export API_TOKEN=abc", false]]);
  const pw = tracker(true);
  pw.t.track("hunter2\r");
  expect(pw.lines).toEqual([]);
  expect(isSensitiveCommand("mysql -u root -pX")).toBe(true);
  expect(isSensitiveCommand("git status")).toBe(false);
});

test("listeners hear line changes", () => {
  const { t } = tracker();
  const heard = jest.fn();
  const off = t.subscribe(heard);
  t.track("g");
  t.track("i");
  off();
  t.track("t");
  expect(heard).toHaveBeenCalledTimes(2);
});

test("suggestions start with the typed line and need two characters", () => {
  const history = ["git status", "grep x", "git push", "gi", "git pull"];
  expect(suggestCommands(history, "g")).toEqual([]);
  expect(suggestCommands(history, "gi")).toEqual([
    "git status",
    "git push",
    "git pull",
  ]);
  expect(suggestCommands(history, "git push")).toEqual([]);
});

test("search keeps commands with every word", () => {
  expect(
    filterHistory(["docker ps -a", "ls", "docker logs"], "PS dock"),
  ).toEqual(["docker ps -a"]);
  expect(filterHistory(["a"], "  ")).toEqual(["a"]);
});
