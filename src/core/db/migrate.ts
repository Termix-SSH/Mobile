import { AppError } from "@/core/errors";
import type { RawDb } from "./driver";
import { migrations as bundled, type Migration } from "./migrations";

export const SCHEMA_VERSION = bundled.length;

/** Applies every migration newer than the file's user_version, each in one transaction. */
export function migrate(raw: RawDb, migrations: Migration[] = bundled): number {
  const current =
    raw.get<{ user_version: number }>("PRAGMA user_version")?.user_version ?? 0;
  const latest = migrations.length;
  if (current > latest) {
    throw new AppError(
      "This data was saved by a newer version of Termix. Update the app to open it.",
      "DB_TOO_NEW",
    );
  }
  for (const step of migrations.slice(current)) {
    raw.transaction(() => {
      raw.exec(step.sql.replace(/--> statement-breakpoint/g, ""));
      raw.exec(`PRAGMA user_version = ${step.version}`);
    });
  }
  return latest;
}
