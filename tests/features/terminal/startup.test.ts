import {
  findStartupSnippet,
  shellQuote,
  startupLines,
} from "@/features/terminal/startup";

const texts = (input: Parameters<typeof startupLines>[0]) =>
  startupLines(input).map((l) => l.text);

const host = { ip: "10.0.0.5", username: "deploy", port: 22, name: "web" };

test("quotes values for any shell", () => {
  expect(shellQuote("a b")).toBe("'a b'");
  expect(shellQuote("it's")).toBe(String.raw`'it'\''s'`);
});

test("a relay shell gets export lines, a phone shell does not", () => {
  const sshOptions = {
    environmentVariables: [
      { key: "EDITOR", value: "vim" },
      { key: "bad name", value: "x" },
    ],
  };
  expect(texts({ transport: "relay", sshOptions, host })).toEqual([
    "export EDITOR='vim'",
  ]);
  expect(texts({ transport: "local", sshOptions, host })).toEqual([]);
});

test("2.9 options win over a 2.8 terminalConfig variable of the same name", () => {
  expect(
    texts({
      transport: "relay",
      legacyEnv: [{ key: "LANG", value: "C" }],
      sshOptions: { environmentVariables: [{ key: "LANG", value: "en" }] },
      host,
    }),
  ).toEqual(["export LANG='en'"]);
});

test("the startup snippet fills host variables and runs before mosh", () => {
  expect(
    startupLines({
      transport: "local",
      snippet: { content: "echo $USER@$HOST:${PORT}" },
      mosh: "mosh-server new",
      host,
    }).map((l) => l.text),
  ).toEqual(["echo deploy@10.0.0.5:22", "mosh-server new"]);
});

test("tmux attaches first; only a new session gets the snippet", () => {
  const base = {
    transport: "local" as const,
    snippet: { content: "cd /srv" },
    host,
  };
  expect(
    startupLines({ ...base, tmux: { line: "tmux new", fresh: true } }),
  ).toEqual([{ text: "tmux new", waitAfterMs: 800 }, { text: "cd /srv" }]);
  expect(
    startupLines({ ...base, tmux: { line: "tmux attach", fresh: false } }),
  ).toEqual([{ text: "tmux attach", waitAfterMs: 800 }]);
});

test("a startup snippet that asks for input is skipped", () => {
  expect(
    texts({
      transport: "local",
      snippet: { content: "ssh $INPUT_1" },
      host,
    }),
  ).toEqual([]);
});

test("finds the snippet by server id or by syncId", () => {
  const list = [
    { id: 1, syncId: "a" },
    { id: 2, syncId: "b" },
  ];
  expect(findStartupSnippet(list, 2)?.syncId).toBe("b");
  expect(findStartupSnippet(list, "a")?.id).toBe(1);
  expect(findStartupSnippet(list, "zz")).toBeNull();
  expect(findStartupSnippet(list, null)).toBeNull();
});
