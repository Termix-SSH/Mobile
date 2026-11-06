import { runInNewContext } from "node:vm";
import { cursorKeysScript } from "@/features/terminal/xterm/cursorKeys";

function bridge() {
  const send = jest.fn();
  const terminal = { modes: { applicationCursorKeysMode: false } };
  const window = {} as { sendTerminalKeySequence: (data: string) => void };
  runInNewContext(cursorKeysScript, {
    window,
    terminal,
    forwardTerminalInput: send,
  });
  return { send, terminal, press: window.sendTerminalKeySequence };
}

test.each(["A", "B", "C", "D", "H", "F"])(
  "cursor %s follows the current mode, including returning from a pager",
  (suffix) => {
    const b = bridge();
    b.press(`\x1b[${suffix}`);
    b.terminal.modes.applicationCursorKeysMode = true;
    b.press(`\x1b[${suffix}`);
    b.terminal.modes.applicationCursorKeysMode = false;
    b.press(`\x1b[${suffix}`);
    expect(b.send.mock.calls).toEqual([
      [`\x1b[${suffix}`],
      [`\x1bO${suffix}`],
      [`\x1b[${suffix}`],
    ]);
  },
);

test("Alt prefix survives application mode; other key sequences stay intact", () => {
  const b = bridge();
  b.terminal.modes.applicationCursorKeysMode = true;
  b.press("\x1b\x1b[C");
  for (const key of ["\t", "\x1b[Z", "\x1b[6~", "\x1bOP", "\x1b[1;2C"]) {
    b.press(key);
    expect(b.send).toHaveBeenLastCalledWith(key);
  }
  expect(b.send).toHaveBeenNthCalledWith(1, "\x1b\x1bOC");
});
