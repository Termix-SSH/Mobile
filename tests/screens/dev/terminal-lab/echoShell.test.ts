import { EchoShell } from "@/screens/dev/terminal-lab/echoShell";

const PROMPT = "\x1b[1;32mlab\x1b[0m$ ";

test("start prints the pattern, help and a prompt", () => {
  const out = new EchoShell().start();
  expect(out).toContain("Truecolor");
  expect(out).toContain("commands:");
  expect(out.endsWith(PROMPT)).toBe(true);
});

test("echoes typed keys and handles backspace", () => {
  const sh = new EchoShell();
  expect(sh.input("ab").output).toBe("ab");
  expect(sh.input("\x7f").output).toBe("\b \b");
  expect(sh.input("\x7f").output).toBe("\b \b");
  expect(sh.input("\x7f").output).toBe("");
});

test("unknown command and empty line", () => {
  const sh = new EchoShell();
  expect(sh.input("nope\r").output).toBe(
    `nope\r\nnope: not found\r\n${PROMPT}`,
  );
  expect(sh.input("\r").output).toBe(`\r\n${PROMPT}`);
});

test("yes and log come back as actions without a prompt", () => {
  const sh = new EchoShell();
  sh.input("yes");
  expect(sh.input("\r")).toEqual({ output: "\r\n", action: "yes" });
  expect(sh.stopped()).toBe(`\r\n${PROMPT}`);
  expect(sh.input("log\r").action).toBe("log");
});

test("ctrl c clears the line", () => {
  const sh = new EchoShell();
  sh.input("abc");
  expect(sh.input("\x03").output).toBe(`^C\r\n${PROMPT}`);
  expect(sh.input("\r").output).toBe(`\r\n${PROMPT}`);
});

test("escape sequences are not echoed", () => {
  expect(new EchoShell().input("\x1b[A").output).toBe("");
});

test("wide characters and emoji echo whole", () => {
  const sh = new EchoShell();
  expect(sh.input("日👍").output).toBe("日👍");
  expect(sh.input("\x7f").output).toBe("\b \b");
});

test("mouse mode prints reports, then turns off", () => {
  const sh = new EchoShell();
  expect(sh.input("mouse\r").output).toContain("\x1b[?1002h");
  expect(sh.input("\x1b[<0;2;3M").output).toContain(
    "mouse press button=0 col=2 row=3",
  );
  expect(sh.input("mouse\r").output).toContain("\x1b[?1002l");
  expect(sh.input("\x1b[<0;2;3M").output).toBe("");
});

test("alt screen redraws on keys and leaves on q", () => {
  const sh = new EchoShell();
  sh.cols = 30;
  sh.rows = 8;
  expect(sh.input("alt\r").output).toContain("\x1b[?1049h");
  expect(sh.inAltScreen).toBe(true);
  expect(sh.input("x").output).toContain("tick 2");
  expect(sh.input("\x1b[<0;5;5M").output).toContain("\x1b[7;1H");
  const leave = sh.input("q").output;
  expect(leave).toContain("\x1b[?1049l");
  expect(leave.endsWith(PROMPT)).toBe(true);
  expect(sh.inAltScreen).toBe(false);
});
