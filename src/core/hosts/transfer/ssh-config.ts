// A small OpenSSH config reader for host import. Like Plugin-Import-Export
// it reads Host, HostName, User, Port, IdentityFile and ProxyJump, and skips
// wildcard patterns. Unlike it, a Host line with several names makes several
// hosts and a Host with no HostName connects to its own name, as ssh does.

export interface SshConfigHost {
  name: string;
  hostname: string;
  user?: string;
  port?: number;
  identityFile?: string;
  /** Each hop as written: alias or [user@]host[:port]. */
  proxyJump: string[];
}

interface Block {
  names: string[];
  hostname?: string;
  user?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string;
}

function unquote(value: string): string {
  const v = value.trim();
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"')
    ? v.slice(1, -1)
    : v;
}

/** Splits a value into words, keeping quoted words whole. */
function words(value: string): string[] {
  return (value.match(/"[^"]*"|\S+/g) ?? []).map(unquote);
}

const isPattern = (name: string) => /[*?!]/.test(name);

export function parseSshConfig(content: string): SshConfigHost[] {
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(\S+?)(?:\s*=\s*|\s+)(.+)$/.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2];

    if (key === "host") {
      const names = words(value).filter((name) => !isPattern(name));
      current = { names };
      blocks.push(current);
      continue;
    }
    if (key === "match") {
      current = null;
      continue;
    }
    if (!current) continue;

    switch (key) {
      case "hostname":
        current.hostname ??= unquote(value);
        break;
      case "user":
        current.user ??= unquote(value);
        break;
      case "port": {
        const port = Number.parseInt(value, 10);
        if (port > 0 && port <= 65535) current.port ??= port;
        break;
      }
      case "identityfile":
        current.identityFile ??= unquote(value);
        break;
      case "proxyjump":
        current.proxyJump ??= unquote(value);
        break;
    }
  }

  const out: SshConfigHost[] = [];
  for (const block of blocks) {
    for (const name of block.names) {
      out.push({
        name,
        hostname: block.hostname ?? name,
        user: block.user,
        port: block.port,
        identityFile: block.identityFile,
        proxyJump:
          block.proxyJump && block.proxyJump.toLowerCase() !== "none"
            ? block.proxyJump
                .split(",")
                .map((hop) => hop.trim())
                .filter(Boolean)
            : [],
      });
    }
  }
  return out;
}

export interface ParsedHop {
  user?: string;
  host: string;
  port?: number;
}

/** "[user@]host[:port]" or "[user@][v6]:port". */
export function parseHop(hop: string): ParsedHop {
  let rest = hop.trim();
  let user: string | undefined;
  const at = rest.lastIndexOf("@");
  if (at > 0) {
    user = rest.slice(0, at);
    rest = rest.slice(at + 1);
  }
  const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(rest);
  if (bracket) {
    return {
      user,
      host: bracket[1],
      port: bracket[2] ? Number(bracket[2]) : undefined,
    };
  }
  const colon = /^([^:]+):(\d+)$/.exec(rest);
  if (colon) return { user, host: colon[1], port: Number(colon[2]) };
  return { user, host: rest };
}
