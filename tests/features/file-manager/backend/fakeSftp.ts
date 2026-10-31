import type { SshFileEntry } from "@/modules/termix-ssh";

const enc = (s: string) => new TextEncoder().encode(s);

/** An in-memory remote file system with the SshSftp calls the app uses. */
export function fakeSftp(home = "/home/u") {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>(["/", "/home", home]);
  const links = new Map<string, string>();
  const modes = new Map<string, number>();

  const parentOf = (p: string) => p.slice(0, p.lastIndexOf("/")) || "/";
  const nameOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);
  const exists = (p: string) => files.has(p) || dirs.has(p) || links.has(p);
  const missing = (p: string) => {
    const e = new Error(`No such file: ${p}`) as Error & { kind: string };
    e.kind = "sftp";
    return e;
  };

  const entryOf = (p: string, follow: boolean): SshFileEntry => {
    let target = p;
    if (follow && links.has(p)) target = links.get(p)!;
    const isLink = !follow && links.has(p);
    if (!isLink && !exists(target)) throw missing(p);
    const isDir = !isLink && dirs.has(target);
    const type = isLink ? 0o120000 : isDir ? 0o040000 : 0o100000;
    return {
      name: nameOf(p),
      size: files.get(target)?.length ?? 0,
      isDir,
      isSymlink: isLink,
      permissions: type | (modes.get(target) ?? (isDir ? 0o755 : 0o644)),
      mtime: 1000,
      atime: 1000,
      uid: 1000,
      gid: 1000,
      linkTarget: isLink ? links.get(p)! : null,
    };
  };

  const sftp = {
    list: jest.fn(async (dir: string) => {
      if (!dirs.has(dir)) throw missing(dir);
      const kids = new Set<string>();
      for (const p of [...files.keys(), ...dirs, ...links.keys()]) {
        if (p !== dir && parentOf(p) === dir) kids.add(p);
      }
      return [...kids].map((p) => entryOf(p, false));
    }),
    stat: jest.fn(async (p: string) => entryOf(p, true)),
    lstat: jest.fn(async (p: string) => entryOf(p, false)),
    realpath: jest.fn(async (p: string) => (p === "." ? home : p)),
    readLink: jest.fn(async (p: string) => links.get(p) ?? ""),
    symlink: jest.fn(async (p: string, target: string) => {
      links.set(p, target);
    }),
    mkdir: jest.fn(async (p: string) => {
      if (exists(p)) throw new Error("exists");
      dirs.add(p);
    }),
    rename: jest.fn(async (from: string, to: string) => {
      if (!exists(from)) throw missing(from);
      const move = <T>(m: Map<string, T>) => {
        for (const [k, v] of [...m]) {
          if (k === from || k.startsWith(`${from}/`)) {
            m.delete(k);
            m.set(to + k.slice(from.length), v);
          }
        }
      };
      move(files);
      move(links);
      for (const d of [...dirs]) {
        if (d === from || d.startsWith(`${from}/`)) {
          dirs.delete(d);
          dirs.add(to + d.slice(from.length));
        }
      }
    }),
    chmod: jest.fn(async (p: string, mode: number) => {
      modes.set(p, mode);
    }),
    remove: jest.fn(async (p: string) => {
      if (!files.delete(p) && !links.delete(p)) throw missing(p);
    }),
    removeRecursive: jest.fn(async (p: string) => {
      let n = 0;
      for (const m of [files, links]) {
        for (const k of [...m.keys()]) {
          if (k === p || k.startsWith(`${p}/`)) {
            m.delete(k);
            n++;
          }
        }
      }
      for (const d of [...dirs]) {
        if (d === p || d.startsWith(`${p}/`)) {
          dirs.delete(d);
          n++;
        }
      }
      return n;
    }),
    readFile: jest.fn(async (p: string) => {
      const data = files.get(links.get(p) ?? p);
      if (!data) throw missing(p);
      return data;
    }),
    writeFile: jest.fn(async (p: string, data: Uint8Array | string) => {
      if (!dirs.has(parentOf(p))) throw missing(parentOf(p));
      files.set(p, typeof data === "string" ? enc(data) : data);
    }),
    download: jest.fn(async () => ({ bytes: 0, millis: 0 })),
    upload: jest.fn(async () => ({ bytes: 0, millis: 0 })),
  };

  return {
    sftp,
    files,
    dirs,
    links,
    put(path: string, text: string) {
      let d = parentOf(path);
      while (d !== "/" && !dirs.has(d)) {
        dirs.add(d);
        d = parentOf(d);
      }
      files.set(path, enc(text));
    },
  };
}
