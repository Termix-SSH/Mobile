import { libraryDatabaseDirectory, moveDatabase } from "@/core/db/location";

const OLD = "/app/Documents/SQLite";
const NEW = "/app/Library/Application Support/SQLite";

function fakeFs(files: string[], failOn?: string) {
  const set = new Set(files);
  return {
    set,
    ops: {
      exists: (p: string) => set.has(p),
      move: async (from: string, to: string) => {
        if (from === failOn) throw new Error("disk full");
        set.delete(from);
        set.add(to);
      },
    },
  };
}

test("the Library folder sits next to Documents", () => {
  expect(libraryDatabaseDirectory("/var/x/Documents/SQLite")).toBe(
    "/var/x/Library/Application Support/SQLite",
  );
});

test("the database and its WAL files move together", async () => {
  const fs = fakeFs([`${OLD}/a.db`, `${OLD}/a.db-wal`, `${OLD}/a.db-shm`]);
  await expect(moveDatabase("a.db", OLD, NEW, fs.ops)).resolves.toBe("moved");
  expect([...fs.set].sort()).toEqual([
    `${NEW}/a.db`,
    `${NEW}/a.db-shm`,
    `${NEW}/a.db-wal`,
  ]);
});

test("a failed move puts the moved files back", async () => {
  const fs = fakeFs([`${OLD}/a.db`, `${OLD}/a.db-wal`], `${OLD}/a.db-wal`);
  await expect(moveDatabase("a.db", OLD, NEW, fs.ops)).resolves.toBe("kept");
  expect([...fs.set].sort()).toEqual([`${OLD}/a.db`, `${OLD}/a.db-wal`]);
});

test("nothing moves when the new folder has it or the old one never did", async () => {
  const both = fakeFs([`${OLD}/a.db`, `${NEW}/a.db`]);
  await expect(moveDatabase("a.db", OLD, NEW, both.ops)).resolves.toBe("none");
  expect(both.set.has(`${OLD}/a.db`)).toBe(true);
  const fresh = fakeFs([]);
  await expect(moveDatabase("a.db", OLD, NEW, fresh.ops)).resolves.toBe("none");
});
