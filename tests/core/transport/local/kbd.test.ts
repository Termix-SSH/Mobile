import {
  autoAnswer,
  classifyKeyboardInteractive,
  responsesWithAnswer,
} from "@/core/transport/local/kbd";

const p = (prompt: string, echo = false) => ({ prompt, echo });
const pw = { password: "secret", authType: "password" };

test("a saved password answers password prompts on its own", () => {
  expect(classifyKeyboardInteractive([p("Password: ")], pw)).toEqual({
    kind: "auto",
    responses: ["secret"],
  });
});

test("without a saved password the user is asked", () => {
  expect(
    classifyKeyboardInteractive([p("Password: ")], { authType: "none" }),
  ).toEqual({ kind: "input", promptIndex: 0, isPush: false });
  // A saved password does not count on a "none" host, like the server.
  expect(
    classifyKeyboardInteractive([p("Password: ")], {
      password: "x",
      authType: "none",
    }).kind,
  ).toBe("input");
});

test("TOTP prompts go to the code dialog", () => {
  expect(
    classifyKeyboardInteractive([p("Verification code: ", true)], pw),
  ).toEqual({ kind: "totp", promptIndex: 0 });
});

test("push flows are not taken for TOTP", () => {
  const push = classifyKeyboardInteractive(
    [p("Press enter to send a push notification")],
    pw,
  );
  expect(push).toEqual({ kind: "input", promptIndex: 0, isPush: true });
  const menu = classifyKeyboardInteractive(
    [p("Choose: [1] Push [2] TOTP:")],
    pw,
  );
  expect(menu.kind).toBe("input");
  // FortiToken mentions push but needs the code field.
  const forti = classifyKeyboardInteractive(
    [p('Type "push" or enter your token code:')],
    pw,
  );
  expect(forti.kind).toBe("totp");
});

test("the first prompt it cannot answer is asked", () => {
  const d = classifyKeyboardInteractive(
    [p("Password: "), p("Duo passcode or option: ")],
    pw,
  );
  expect(d).toEqual({ kind: "input", promptIndex: 1, isPush: false });
});

test("answers fill the rest with the saved password or empty", () => {
  const prompts = [p("Password: "), p("Code: "), p("Other: ")];
  expect(responsesWithAnswer(prompts, 1, "123", "secret")).toEqual([
    "secret",
    "123",
    "",
  ]);
  expect(autoAnswer(prompts, "secret")).toEqual(["secret", "", ""]);
  expect(autoAnswer(prompts)).toEqual(["", "", ""]);
});
