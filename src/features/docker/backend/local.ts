import {
  EXTRA_PATH_DIRS,
  STACK_NAME_RE,
  classifyRuntimeError,
  containerCommand,
  countContainers,
  dockerArgs,
  parseComposeProjects,
  parseContainerList,
  parseContainerStats,
  parseKeys,
  parseServices,
  shellQuote,
  stackStateFromServices,
  type ContainerAction,
  type ContainerCounts,
  type ContainerRuntime,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { ExecRunner, RunOptions } from "@/core/exec";
import type { DockerContainer } from "@/types";
import type { DockerBackend, DockerCheck } from "./types";

const MAX_COMPOSE_BYTES = 1024 * 1024;

/** Finds the runtime, its version and whether `ps` works, in one exec. */
export function detectScript(prefer: ContainerRuntime): string {
  const order = prefer === "podman" ? "podman docker" : "docker podman";
  return `export PATH="${EXTRA_PATH_DIRS}:$PATH"
for r in ${order}; do
  if command -v "$r" >/dev/null 2>&1; then
    echo "runtime=$r"
    echo "version=$("$r" --version 2>&1 | head -n1)"
    if out=$("$r" ps -q 2>&1); then echo "ok=1"; else echo "error=$(printf '%s' "$out" | head -n1)"; fi
    exit 0
  fi
done
echo "runtime=none"
`;
}

export function parseDetect(output: string): DockerCheck {
  const keys = parseKeys(output);
  if (keys.runtime !== "docker" && keys.runtime !== "podman") {
    return {
      available: false,
      code: "NOT_INSTALLED",
      error: "Docker is not installed on this host.",
    };
  }
  const runtime = keys.runtime;
  const version =
    /version ([^\s,]+)/i.exec(keys.version ?? "")?.[1] ?? "unknown";
  if (keys.ok === "1") return { available: true, version, runtime };
  const error = keys.error ?? "";
  return {
    available: false,
    version,
    runtime,
    code: classifyRuntimeError(error),
    error: error || "Docker did not answer",
  };
}

/**
 * Docker over the phone's own SSH. `sudo` runs every command as root, for
 * users outside the docker group. `stacks` is the host's stacks switch.
 */
export function createLocalDockerBackend(
  runner: ExecRunner,
  options: { prefer?: ContainerRuntime; sudo?: boolean; stacks?: boolean } = {},
): DockerBackend & { counts(signal?: AbortSignal): Promise<ContainerCounts> } {
  let runtime: ContainerRuntime = options.prefer ?? "docker";
  const sudo = options.sudo ?? false;
  const opts = (o: RunOptions = {}): RunOptions => ({
    mode: sudo ? "root" : "plain",
    ...o,
  });
  const cli = async (args: string, o?: RunOptions) =>
    (await runner.run(`${containerCommand(runtime, args)}\n`, opts(o))).stdout;

  return {
    via: "local",

    async check() {
      const { stdout } = await runner.run(
        detectScript(runtime),
        opts({ allowFail: true }),
      );
      const found = parseDetect(stdout);
      if (found.runtime) runtime = found.runtime;
      return found;
    },

    async containers(signal) {
      const out = await cli(dockerArgs.list(true), { signal });
      return parseContainerList(out) as unknown as DockerContainer[];
    },

    async action(id, action) {
      const args =
        action === "remove"
          ? dockerArgs.remove(id, true)
          : dockerArgs.action(action as ContainerAction, id);
      await cli(args, { reason: `${action} ${id}`, timeoutMs: 120_000 });
    },

    async stats(id, signal) {
      return parseContainerStats(
        await cli(dockerArgs.stats(id), { signal, timeoutMs: 20_000 }),
      );
    },

    async logs(id, tail, signal) {
      return cli(dockerArgs.logs(id, { tail }), { signal });
    },

    async stacksEnabled() {
      return options.stacks === true;
    },

    async stacks(signal) {
      return parseComposeProjects(
        await cli(`${dockerArgs.composeProjects()} 2>&1`, { signal }),
      );
    },

    async stack(stack) {
      if (!STACK_NAME_RE.test(stack.name)) {
        throw new Error("That is not a valid stack name");
      }
      const ps = await cli(`compose -p ${stack.name} ps -a --format json`, {
        allowFail: true,
      });
      const services = parseServices(ps);
      let compose: string | null = null;
      if (stack.composeFile) {
        const read = await runner.run(
          `head -c ${MAX_COMPOSE_BYTES} -- ${shellQuote(stack.composeFile)}\n`,
          opts({ allowFail: true }),
        );
        compose = read.code === 0 ? read.stdout : null;
      }
      const state = stackStateFromServices(services);
      return {
        name: stack.name,
        composeFile: stack.composeFile,
        compose,
        services,
        running: state.running,
        total: state.total,
      };
    },

    console: () => ({ kind: "local", runner, runtime, sudo }),

    async counts(signal) {
      return countContainers(await cli(dockerArgs.states(), { signal }));
    },
  };
}
