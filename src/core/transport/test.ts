/**
 * Tries a login from this phone without opening a shell, for the Test
 * connection buttons in the host and login editors. Works on unsaved values.
 */
import type { HostConnectRepository } from "@/core/data/types";
import {
  connect,
  isSshEngineAvailable,
  type SshConnectConfig,
  type SshKbdRequest,
  type SshSession,
} from "@/modules/termix-ssh";
import { fromError, type ConnectFailure } from "./errors";
import { assertDeviceAuth } from "./local/auth-support";
import { closeAll, openJumps } from "./local/chain";
import { checkHostKey, type AskHostKey } from "./local/host-keys";
import { NO_ENGINE } from "./local";
import type { TerminalHostConfig } from "./types";

export interface TestTarget {
  /** Saved host being edited, so a key it already trusts is used. */
  hostId?: number;
  name?: string;
  ip: string;
  port: number;
  username: string;
  authType: string;
  password?: string;
  key?: string;
  keyPassword?: string;
  /** OpenSSH user certificate for the key. */
  certificate?: string;
  jumpHostIds?: number[];
}

export type TestResult =
  | { ok: true; message: string; fingerprint: string }
  | { ok: false; failure: ConnectFailure };

export interface TestHandlers {
  askHostKey: AskHostKey;
  signal?: AbortSignal;
}

const TEST_TIMEOUT_SECS = 15;

/** The engine login for a test, before jump hosts. */
export function testConfig(target: TestTarget): SshConnectConfig {
  const auth = target.authType;
  const withSecret = auth === "password" || auth === "key";
  return {
    host: target.ip.trim(),
    port: target.port || 22,
    username: target.username.trim(),
    password: withSecret ? target.password || undefined : undefined,
    privateKey: auth === "key" ? target.key || undefined : undefined,
    passphrase: auth === "key" ? target.keyPassword || undefined : undefined,
    certificate: auth === "key" ? target.certificate || undefined : undefined,
    tryKeyboard: auth !== "tailscale",
    allowLegacyAlgorithms: true,
    connectTimeoutSecs: auth === "tailscale" ? 60 : TEST_TIMEOUT_SECS,
    keepaliveIntervalSecs: 0,
  };
}

/** Answers password prompts with the password, and gives up on anything else. */
export function answerKbd(
  request: SshKbdRequest,
  password: string | undefined,
): string[] | null {
  if (!password) return null;
  const answers = request.prompts.map((p) =>
    /pass/i.test(p.prompt) ? password : null,
  );
  return answers.every((a) => a !== null) ? (answers as string[]) : null;
}

export async function testOnDevice(
  repo: HostConnectRepository | undefined,
  target: TestTarget,
  handlers: TestHandlers,
): Promise<TestResult> {
  if (!isSshEngineAvailable) {
    return {
      ok: false,
      failure: {
        stage: "unavailable",
        message: NO_ENGINE,
        hint: "Save the host and connect to it to check it.",
      },
    };
  }
  const sessions: SshSession[] = [];
  try {
    assertDeviceAuth(target.authType, target.password, target.key);
    const config = testConfig(target);
    const fake: TerminalHostConfig = {
      id: target.hostId ?? 0,
      name: target.name ?? target.ip,
      ip: target.ip,
      port: target.port,
      username: target.username,
      authType: target.authType as TerminalHostConfig["authType"],
    };
    const hops = await openJumps(repo, fake, target.jumpHostIds ?? [], {
      askHostKey: handlers.askHostKey,
      askKbd: async () => null,
      signal: handlers.signal,
      connectTimeoutSecs: TEST_TIMEOUT_SECS,
    });
    sessions.push(...hops);
    const profile =
      target.hostId && repo
        ? await repo.profile(target.hostId).catch(() => null)
        : null;
    const prompts = {
      verifyHostKey: (key: Parameters<typeof checkHostKey>[0]["key"]) =>
        checkHostKey({
          hostId: profile ? target.hostId! : null,
          saved: profile?.hostKey ?? null,
          key,
          jump: false,
          name: target.name ?? target.ip,
          ask: handlers.askHostKey,
          repo,
        }),
      keyboardInteractive: async (request: SshKbdRequest) =>
        answerKbd(request, target.password),
    };
    const last = hops[hops.length - 1];
    const opts = { signal: handlers.signal };
    const session = last
      ? await last.connectVia(config, prompts, opts)
      : await connect(config, prompts, opts);
    sessions.push(session);
    return {
      ok: true,
      message: `Logged in as ${config.username} on ${config.host}`,
      fingerprint: session.hostKey.sha256,
    };
  } catch (err) {
    const failure = fromError(err);
    if (failure.stage === "cancelled") {
      failure.message =
        "The host asked for more than a password, like a code. Save the host and connect to finish the login.";
    }
    return { ok: false, failure };
  } finally {
    closeAll(sessions);
  }
}
