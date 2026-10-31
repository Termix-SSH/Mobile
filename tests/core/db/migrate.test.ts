import os from "node:os";
import path from "node:path";
import { migrate, SCHEMA_VERSION } from "@/core/db/migrate";
import { migrations } from "@/core/db/migrations";
import { openTestDb } from "../../helpers/db";

const fresh = () =>
  openTestDb(path.join(os.tmpdir(), `termix-m-${Math.random()}.db`)).raw;

const version = (raw: ReturnType<typeof fresh>) =>
  raw.get<{ user_version: number }>("PRAGMA user_version")!.user_version;

test("a new file gets every table and the latest version", () => {
  const raw = fresh();
  expect(migrate(raw)).toBe(SCHEMA_VERSION);
  expect(version(raw)).toBe(migrations.length);
  const tables = raw
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")
    .map((t) => t.name);
  expect(tables).toEqual(
    expect.arrayContaining([
      "ssh_data",
      "ssh_credentials",
      "ssh_folders",
      "snippets",
      "snippet_folders",
      "host_defaults",
      "user_preferences",
      "sync_records",
      "sync_conflicts",
      "sync_state",
      "sync_entities",
      "command_history",
      "recent_activity",
    ]),
  );
});

test("running twice changes nothing", () => {
  const raw = fresh();
  migrate(raw);
  expect(() => migrate(raw)).not.toThrow();
  expect(version(raw)).toBe(SCHEMA_VERSION);
});

test("only steps newer than the file run", () => {
  const raw = fresh();
  const steps = [
    { version: 1, name: "a", sql: "CREATE TABLE a (id integer);" },
    {
      version: 2,
      name: "b",
      sql: "CREATE TABLE b (id integer);--> statement-breakpoint\nCREATE TABLE c (id integer);",
    },
  ];
  migrate(raw, steps.slice(0, 1));
  expect(version(raw)).toBe(1);
  migrate(raw, steps);
  expect(version(raw)).toBe(2);
  expect(raw.all("SELECT * FROM c")).toEqual([]);
});

test("a failed step rolls back and keeps the old version", () => {
  const raw = fresh();
  const steps = [
    { version: 1, name: "bad", sql: "CREATE TABLE x (id integer); NOPE;" },
  ];
  expect(() => migrate(raw, steps)).toThrow();
  expect(version(raw)).toBe(0);
  expect(raw.all("SELECT name FROM sqlite_master WHERE name = 'x'")).toEqual(
    [],
  );
});

test("a file from a newer app is refused", () => {
  const raw = fresh();
  raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
  expect(() => migrate(raw)).toThrow(
    expect.objectContaining({ code: "DB_TOO_NEW" }),
  );
});
