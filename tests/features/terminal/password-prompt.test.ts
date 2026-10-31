import {
  FILL_COOLDOWN_MS,
  OFFER_COOLDOWN_MS,
  PromptWatcher,
  isPasswordPrompt,
  isSudoPrompt,
  pickPassword,
  stripAnsi,
} from "@/features/terminal/password-prompt";
import { hostCanFill } from "@/features/terminal/password-fill";
import { CommandLineTracker } from "@/features/terminal/history/capture";
import type { SSHHost } from "@/types";

test("finds the prompts the web terminal does", () => {
  expect(isPasswordPrompt("[sudo] password for luke: ")).toBe(true);
  expect(isPasswordPrompt("Password:")).toBe(true);
  expect(isPasswordPrompt("user@host's password: ")).toBe(true);
  expect(isPasswordPrompt("sudo: a password is required")).toBe(true);
  expect(isPasswordPrompt("Password: wrong\nluke@box:~$ ")).toBe(false);
  expect(isPasswordPrompt("the password was changed")).toBe(false);
});

test("sudo prompts by output or by the command typed", () => {
  expect(isSudoPrompt("[sudo] password for luke:", "")).toBe(true);
  expect(isSudoPrompt("Password:", "sudo ls")).toBe(true);
  expect(isSudoPrompt("Password:", "ssh other")).toBe(false);
  expect(isSudoPrompt("Sorry, try again.\nPassword:", "")).toBe(true);
});

test("colors and titles are stripped before matching", () => {
  expect(stripAnsi("\x1b[1m[sudo]\x1b[0m pass\x1b]0;t\x07word:\x1b(B")).toBe(
    "[sudo] password:",
  );
});

test("sudo prompts take the sudo password first, others the login's", () => {
  const saved = { password: "login", sudoPassword: "root" };
  expect(pickPassword(true, saved)).toBe("root");
  expect(pickPassword(false, saved)).toBe("login");
  expect(pickPassword(true, { password: "login" })).toBe("login");
  expect(pickPassword(false, {})).toBeNull();
});

function watcher(
  opts: { sudoFill?: boolean; fill?: boolean; can?: boolean } = {},
) {
  let time = 0;
  const offers: boolean[] = [];
  const w = new PromptWatcher({
    settings: () => ({
      passwordPromptAutoFill: opts.fill ?? true,
      sudoPasswordAutoFill: opts.sudoFill ?? false,
    }),
    canFill: () => opts.can ?? true,
    lastCommand: () => "",
    offer: (sudo) => offers.push(sudo),
    now: () => time,
  });
  return {
    w,
    offers,
    tick: (ms: number) => {
      time += ms;
    },
  };
}

test("a prompt split over chunks is offered once, then waits", () => {
  const { w, offers, tick } = watcher();
  w.feed("luke@box's pass");
  w.feed("word: ");
  expect(offers).toEqual([false]);
  expect(w.atPasswordPrompt()).toBe(true);
  w.feed("\r\nPassword: ");
  expect(offers).toHaveLength(1);
  tick(OFFER_COOLDOWN_MS);
  w.line("Password: ");
  expect(offers).toHaveLength(2);
});

test("after a fill the next offer comes sooner", () => {
  const { w, offers, tick } = watcher();
  w.line("Password:");
  w.settle(true);
  tick(FILL_COOLDOWN_MS);
  w.line("Password: ");
  expect(offers).toHaveLength(2);
});

test("sudo is opt in, the host can turn fill off, and no saved password means no offer", () => {
  const off = watcher();
  off.w.line("[sudo] password for luke:");
  expect(off.offers).toEqual([]);
  const on = watcher({ sudoFill: true });
  on.w.line("[sudo] password for luke:");
  expect(on.offers).toEqual([true]);
  const hostOff = watcher({ fill: false });
  hostOff.w.line("Password:");
  expect(hostOff.offers).toEqual([]);
  expect(hostOff.w.atPasswordPrompt()).toBe(true);
  const none = watcher({ can: false });
  none.w.line("Password:");
  expect(none.offers).toEqual([]);
});

test("a password typed at a prompt never reaches history", () => {
  const { w } = watcher({ can: false });
  const saved: string[] = [];
  const tracker = new CommandLineTracker({
    onSubmit: (line) => saved.push(line),
    isPasswordInput: () => w.atPasswordPrompt(),
  });
  tracker.track("sudo ls\r");
  w.line("[sudo] password for luke:");
  tracker.track("hunter2\r");
  w.line("luke@box:~$");
  tracker.track("pwd\r");
  expect(saved).toEqual(["sudo ls", "pwd"]);
  expect(tracker.lastSubmitted()).toBe("pwd");
});

test("shared hosts and hosts with no password are never offered a fill", () => {
  expect(hostCanFill({ password: "x" } as SSHHost)).toBe(true);
  expect(hostCanFill({ hasSudoPassword: true } as unknown as SSHHost)).toBe(
    true,
  );
  expect(
    hostCanFill({
      password: "x",
      shared: { owner: "a", permissionLevel: "view" },
    } as SSHHost),
  ).toBe(false);
  expect(hostCanFill({} as SSHHost)).toBe(false);
});

test("a prompt at the end of a big colored chunk is still seen", () => {
  const { w, offers } = watcher();
  w.feed("\x1b[32mlog line\x1b[0m\r\n".repeat(500) + "Password: ");
  expect(offers).toHaveLength(1);
});
