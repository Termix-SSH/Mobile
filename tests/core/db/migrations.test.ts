import { migrations } from "@/core/db/migrations";

const { readMigrations } = require("../../../scripts/db-migrations.cjs");

test("migrations.ts matches drizzle/ (run npm run db:generate)", () => {
  expect(migrations).toEqual(readMigrations());
});

test("versions count up from 1", () => {
  expect(migrations.map((m) => m.version)).toEqual(
    migrations.map((_, i) => i + 1),
  );
});
