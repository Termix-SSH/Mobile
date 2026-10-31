import {
  DETECT_SCRIPT,
  OPENRC_LIST_SCRIPT,
  actionScript,
  detailScript,
  journalArgs,
  journalScript,
  listUnitsScript,
  openRcActionScript,
  openRcStatusScript,
  parseDetail,
  parseDetect,
  parseEntry,
  parseJournal,
  parseJournalQuery,
  parseKeys,
  parseOpenRcList,
  parseUnitList,
  requireService,
  shellQuote,
  watchdog,
  type InitSystem,
  type JournalEntry,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { ExecRunner } from "@/core/exec";
import { Utf8Stream } from "@/core/transport/local/LocalShell";
import type { HostServices, JournalFilter, ServicesBackend } from "./types";

/** Splits a stream into lines, keeping a cut line for the next chunk. */
export class LineBuffer {
  private rest = "";

  push(text: string): string[] {
    const lines = (this.rest + text).split("\n");
    this.rest = lines.pop() ?? "";
    return lines;
  }
}

const VERB: Record<string, string> = {
  start: "Start",
  stop: "Stop",
  restart: "Restart",
};

/**
 * systemd (or OpenRC) over the phone's SSH. Reads run as root when that
 * needs no password, so every unit shows; changes ask for sudo if needed.
 */
export function createLocalServicesBackend(
  runner: ExecRunner,
): ServicesBackend {
  let init: InitSystem | null = null;

  async function detect(signal?: AbortSignal): Promise<HostServices> {
    const { stdout } = await runner.run(DETECT_SCRIPT, {
      mode: "auto",
      signal,
    });
    const found = parseDetect(stdout);
    init = found.init;
    return found;
  }

  const initOf = async () => init ?? (await detect()).init;

  const query = (filter: JournalFilter) =>
    parseJournalQuery({
      unit: filter.units,
      priority: filter.priority === undefined ? "" : String(filter.priority),
      lines: String(filter.lines),
    });

  return {
    via: "local",

    status: detect,

    async units(kind, signal) {
      if ((await initOf()) === "openrc") {
        const { stdout } = await runner.run(OPENRC_LIST_SCRIPT, {
          mode: "auto",
          signal,
        });
        return parseOpenRcList(stdout);
      }
      const { stdout } = await runner.run(listUnitsScript(kind), {
        mode: "auto",
        signal,
      });
      return parseUnitList(stdout);
    },

    async unit(name, signal) {
      const system = await initOf();
      const service = requireService(name, system);
      if (system === "openrc") {
        const { stdout } = await runner.run(openRcStatusScript(service), {
          mode: "auto",
          signal,
        });
        return { name, props: {}, status: stdout.trim() };
      }
      const { stdout } = await runner.run(detailScript(service), {
        mode: "auto",
        signal,
      });
      return parseDetail(name, stdout);
    },

    async action(name, action) {
      const system = await initOf();
      const service = requireService(name, system);
      const script =
        system === "openrc"
          ? `${openRcActionScript(service, action)}echo "state=$(rc-service ${shellQuote(service)} status >/dev/null 2>&1 && echo active || echo inactive)"\n`
          : actionScript(service, action);
      const { stdout } = await runner.run(script, {
        mode: "root",
        timeoutMs: 120_000,
        reason: `${VERB[action] ?? action} ${name}`,
      });
      return parseKeys(stdout).state || "unknown";
    },

    async journal(filter, signal) {
      const q = query(filter);
      const { stdout } = await runner.run(journalScript(q), {
        mode: "auto",
        signal,
        timeoutMs: 60_000,
        maxBytes: 8 * 1024 * 1024,
      });
      return parseJournal(stdout, q);
    },

    follow(filter, onEntries, onEnd) {
      const q = query({ ...filter, lines: 50 });
      const decoder = new Utf8Stream();
      const lines = new LineBuffer();
      let handle: { close(): Promise<void> } | null = null;
      let stopped = false;
      runner
        .stream(
          watchdog(`${journalArgs(q, { follow: true })} 2>&1`),
          {
            onStdout: (data) => {
              const entries = lines
                .push(decoder.decode(data))
                .map(parseEntry)
                .filter((e): e is JournalEntry => e !== null);
              if (entries.length) onEntries(entries);
            },
            onExit: () => {
              if (!stopped) onEnd();
            },
          },
          { mode: "auto" },
        )
        .then((h) => {
          handle = h;
          if (stopped) void h.close();
        })
        .catch((e) => onEnd(e instanceof Error ? e.message : String(e)));
      return {
        stop: () => {
          stopped = true;
          void handle?.close().catch(() => {});
        },
      };
    },
  };
}
