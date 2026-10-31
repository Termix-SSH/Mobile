/**
 * Keyboard-interactive rounds, decided the same way core does
 * (src/backend/hosts/connect/keyboard-interactive.ts): the stored password
 * fills password prompts, one question per round goes to the user.
 */
import type { SshKbdRequest } from "@/modules/termix-ssh";

const PASSWORD_PATTERN = /password/i;
// FortiToken asks for a code or the word "push", so it needs a text field.
const FORTI_TOKEN_PATTERN = /type\s+['"]?push['"]?/i;
const PUSH_MENU_PATTERN = /choose.*push.*totp/i;
const PUSH_PROMPT_PATTERN =
  /press enter.*(push|send)|push notification|authentication by phone/i;
const TOTP_PATTERN =
  /verification code|verification_code|token|otp|2fa|authenticator|google.*auth/i;

export type KbdDecision =
  | { kind: "auto"; responses: string[] }
  | { kind: "totp"; promptIndex: number }
  | { kind: "input"; promptIndex: number; isPush: boolean };

type Prompt = SshKbdRequest["prompts"][number];

function autoResponses(prompts: Prompt[], password?: string): string[] {
  return prompts.map((p) =>
    PASSWORD_PATTERN.test(p.prompt) && password ? password : "",
  );
}

/** The user's answer at one index, stored password or empty for the rest. */
export function responsesWithAnswer(
  prompts: Prompt[],
  answerIndex: number,
  answer: string,
  password?: string,
): string[] {
  return prompts.map((p, i) => {
    if (i === answerIndex) return answer;
    if (PASSWORD_PATTERN.test(p.prompt) && password) return password;
    return "";
  });
}

export function classifyKeyboardInteractive(
  prompts: Prompt[],
  login: { password?: string; authType: string },
): KbdDecision {
  const texts = prompts.map((p) => p.prompt);
  const isFortiToken = texts.some((p) => FORTI_TOKEN_PATTERN.test(p));
  const isPushFlow =
    !isFortiToken &&
    texts.some((p) => PUSH_MENU_PATTERN.test(p) || PUSH_PROMPT_PATTERN.test(p));

  if (!isPushFlow) {
    const totpIndex = prompts.findIndex((p) => TOTP_PATTERN.test(p.prompt));
    if (totpIndex !== -1) return { kind: "totp", promptIndex: totpIndex };
  }

  const hasStoredPassword = !!login.password && login.authType !== "none";
  const passwordIndex = prompts.findIndex((p) =>
    PASSWORD_PATTERN.test(p.prompt),
  );
  // DUO and PAM challenges often don't say "password" at all.
  const firstUnanswered = prompts.findIndex(
    (p) => !(PASSWORD_PATTERN.test(p.prompt) && hasStoredPassword),
  );
  if (firstUnanswered === -1) {
    return { kind: "auto", responses: autoResponses(prompts, login.password) };
  }
  const promptIndex =
    passwordIndex !== -1 && !hasStoredPassword
      ? passwordIndex
      : firstUnanswered;
  return {
    kind: "input",
    promptIndex,
    isPush: PUSH_PROMPT_PATTERN.test(prompts[promptIndex].prompt),
  };
}

/** For logins with nobody to ask: stored password to password prompts, empty elsewhere. */
export function autoAnswer(prompts: Prompt[], password?: string): string[] {
  return autoResponses(prompts, password);
}
