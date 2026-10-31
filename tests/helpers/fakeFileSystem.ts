// An in-memory stand in for the parts of expo-file-system the app uses.
// Use with: jest.mock("expo-file-system", () => require("../helpers/fakeFileSystem").fakeFileSystem())

export function fakeFileSystem() {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>(["file:///doc", "file:///cache"]);
  const picks: string[] = [];

  const join = (base: string, parts: string[]) =>
    [base.replace(/\/+$/, ""), ...parts.map((p) => p.replace(/^\/+|\/+$/g, ""))]
      .filter(Boolean)
      .join("/");
  const baseOf = (x: unknown) =>
    typeof x === "string" ? x : (x as { uri: string }).uri;
  const nameOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);
  const parentOf = (uri: string) => uri.slice(0, uri.lastIndexOf("/"));

  class File {
    uri: string;
    constructor(base: unknown, ...parts: string[]) {
      this.uri = join(baseOf(base), parts);
    }
    get name() {
      return nameOf(this.uri);
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri)?.length ?? 0;
    }
    get contentUri() {
      return this.uri.replace("file://", "content://fake");
    }
    get parentDirectory() {
      return new Directory(parentOf(this.uri));
    }
    async text() {
      const data = files.get(this.uri);
      if (!data) throw new Error(`missing ${this.uri}`);
      return new TextDecoder().decode(data);
    }
    create(_o?: unknown) {
      files.set(this.uri, files.get(this.uri) ?? new Uint8Array(0));
    }
    delete() {
      files.delete(this.uri);
    }
    write(content: string | Uint8Array) {
      files.set(
        this.uri,
        typeof content === "string"
          ? new TextEncoder().encode(content)
          : content,
      );
    }
    async copy(target: File) {
      const data = files.get(this.uri);
      if (!data) throw new Error(`missing ${this.uri}`);
      files.set(target.uri, data.slice());
    }
    open(mode: string) {
      const uri = this.uri;
      if (mode === "wt" || mode === "w") files.set(uri, new Uint8Array(0));
      let offset = mode === "wa" ? (files.get(uri)?.length ?? 0) : 0;
      return {
        get offset() {
          return offset;
        },
        set offset(v: number) {
          offset = v;
        },
        get size() {
          return files.get(uri)?.length ?? 0;
        },
        readBytes(n: number) {
          const data = files.get(uri) ?? new Uint8Array(0);
          const out = data.slice(offset, offset + n);
          offset += out.length;
          return out;
        },
        writeBytes(bytes: Uint8Array) {
          const old = files.get(uri) ?? new Uint8Array(0);
          const next = new Uint8Array(
            Math.max(old.length, offset + bytes.length),
          );
          next.set(old);
          next.set(bytes, offset);
          offset += bytes.length;
          files.set(uri, next);
        },
        close() {},
      };
    }
  }

  class Directory {
    uri: string;
    constructor(base: unknown, ...parts: string[]) {
      this.uri = join(baseOf(base), parts);
    }
    get name() {
      return nameOf(this.uri);
    }
    get exists() {
      return dirs.has(this.uri);
    }
    create() {
      let d = this.uri;
      while (d && d !== "file://") {
        dirs.add(d);
        d = parentOf(d);
      }
    }
    delete() {
      const inside = (uri: string) =>
        uri === this.uri || uri.startsWith(`${this.uri}/`);
      for (const d of [...dirs]) if (inside(d)) dirs.delete(d);
      for (const f of [...files.keys()]) if (inside(f)) files.delete(f);
    }
    list() {
      const out: (File | Directory)[] = [];
      for (const d of dirs)
        if (parentOf(d) === this.uri) out.push(new Directory(d));
      for (const f of files.keys())
        if (parentOf(f) === this.uri) out.push(new File(f));
      return out;
    }
    createFile(name: string) {
      const f = new File(this.uri, name);
      f.create();
      return f;
    }
    createDirectory(name: string) {
      const d = new Directory(this.uri, name);
      d.create();
      return d;
    }
    static async pickDirectoryAsync() {
      const next = picks.shift();
      if (!next) throw new Error("cancelled");
      const d = new Directory(next);
      d.create();
      return d;
    }
  }

  return {
    File,
    Directory,
    Paths: {
      get document() {
        return new Directory("file:///doc");
      },
      get cache() {
        return new Directory("file:///cache");
      },
    },
    FileMode: {
      ReadWrite: "rw",
      ReadOnly: "r",
      WriteOnly: "w",
      Append: "wa",
      Truncate: "wt",
    },
    __files: files,
    __dirs: dirs,
    __picks: picks,
  };
}
