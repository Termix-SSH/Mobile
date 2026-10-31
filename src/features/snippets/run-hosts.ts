// Runs a snippet on several hosts at once, with no terminal open. The phone
// opens SSH itself when it can reach the host, otherwise the server runs it.
import { accounts } from "@/core/accounts";
import { serverHostId, serverSnippetId } from "@/core/sync/host-ids";
import { planFor, type Transport } from "@/core/transport";
import { utf8Decode } from "@/modules/termix-ssh";
import type { Snippet, SSHHost } from "@/types";
import { toTerminalHostConfig } from "@/utils/hosts";
import { hostContext, resolveSnippet } from "./run";

export interface HostRunResult {
  host: SSHHost;
  ok: boolean;
  output: string;
  error?: string;
  via?: "phone" | "server";
}

/** The parts that talk to the outside, so the loop can be tested alone. */
export interface RunBackend {
  /** Ways to reach a host, in order. */
  attempts(host: SSHHost): Promise<("phone" | "server")[]>;
  phone(
    host: SSHHost,
    command: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }>;
  server(
    host: SSHHost,
    snippet: Snippet,
    inputValues: Record<string, string>,
  ): Promise<{ success: boolean; output: string; error?: string }>;
}

export interface RunOptions {
  inputValues?: Record<string, string>;
  /** Hosts running at the same time. */
  concurrency?: number;
  onResult?: (result: HostRunResult) => void;
  signal?: AbortSignal;
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export async function runOnHost(
  backend: RunBackend,
  snippet: Snippet,
  host: SSHHost,
  inputValues: Record<string, string> = {},
): Promise<HostRunResult> {
  let ways: ("phone" | "server")[];
  try {
    ways = await backend.attempts(host);
  } catch (error) {
    return { host, ok: false, output: "", error: message(error) };
  }
  if (ways.length === 0) {
    return {
      host,
      ok: false,
      output: "",
      error: "No way to reach this host from here",
    };
  }
  let last = "";
  for (const via of ways) {
    try {
      if (via === "phone") {
        const command = resolveSnippet(snippet, hostContext(host), inputValues);
        const res = await backend.phone(host, command);
        const failed = res.exitCode !== null && res.exitCode !== 0;
        return {
          host,
          via,
          ok: !failed,
          output: res.stdout,
          error:
            res.stderr || (failed ? `Exited with ${res.exitCode}` : undefined),
        };
      }
      const res = await backend.server(host, snippet, inputValues);
      return {
        host,
        via,
        ok: res.success !== false,
        output: res.output ?? "",
        error: res.error,
      };
    } catch (error) {
      last = message(error);
    }
  }
  return { host, ok: false, output: "", error: last };
}

/** Runs the snippet on every host, a few at a time, results in host order. */
export async function runOnHosts(
  backend: RunBackend,
  snippet: Snippet,
  hosts: SSHHost[],
  options: RunOptions = {},
): Promise<HostRunResult[]> {
  const results = new Array<HostRunResult>(hosts.length);
  let next = 0;
  const worker = async () => {
    while (next < hosts.length && !options.signal?.aborted) {
      const i = next++;
      const result = await runOnHost(
        backend,
        snippet,
        hosts[i],
        options.inputValues,
      );
      results[i] = result;
      options.onResult?.(result);
    }
  };
  const count = Math.max(1, Math.min(options.concurrency ?? 3, hosts.length));
  await Promise.all(Array.from({ length: count }, worker));
  return results.filter(Boolean);
}

/** The real backend for an account. */
export function accountBackend(accountId: string | null): RunBackend {
  const id = accountId ?? accounts.active().id;
  const phoneTransports = new Map<number, Transport>();
  return {
    async attempts(host) {
      const plan = await planFor(id, host, true);
      if (plan.blocked && !plan.attempts.length) {
        throw new Error(plan.blocked.reason);
      }
      const ways: ("phone" | "server")[] = [];
      for (const t of plan.attempts) {
        if (t.kind === "local") {
          phoneTransports.set(host.id, t);
          ways.push("phone");
        } else ways.push("server");
      }
      return ways;
    },
    async phone(host, command) {
      const transport = phoneTransports.get(host.id);
      if (!transport?.openSession) throw new Error("This phone can't run it");
      const session = await transport.openSession(toTerminalHostConfig(host));
      try {
        const res = await session.exec(command, { timeoutSecs: 60 });
        return {
          stdout: utf8Decode(res.stdout),
          stderr: utf8Decode(res.stderr),
          exitCode: res.exitCode,
        };
      } finally {
        void session.close();
      }
    },
    async server(host, snippet, inputValues) {
      const client = accounts.client(id);
      if (!client) throw new Error("No server is linked");
      return client.api.snippets.executeSnippet(
        await serverSnippetId(id, snippet),
        await serverHostId(id, host),
        inputValues,
      );
    },
  };
}
