// Works out what a picked file, pasted text or scanned code holds, and
// imports it.
import type { DataRepositories } from "@/core/data/types";
import {
  importHosts,
  rowsFromSshConfig,
  type ImportOptions,
  type ImportResult,
} from "@/core/hosts/transfer/import";
import {
  decodeHostShare,
  SHARE_PREFIX,
  type SharedHost,
} from "@/core/hosts/transfer/share";
import {
  normalizeRow,
  parseImportFile,
  type ImportFile,
  type ImportRow,
} from "@/core/hosts/transfer/termix-json";
import { t } from "@/i18n";

export type ImportSource =
  | { kind: "termix"; file: ImportFile }
  | { kind: "ssh-config"; file: ImportFile }
  | { kind: "link"; shared: SharedHost };

/** What a person gets told about a source before it is imported. */
export function describeSource(source: ImportSource): string {
  if (source.kind === "link") {
    return t("hostTransfer.read.linkHost", {
      name: source.shared.name || source.shared.ip,
    });
  }
  const count = source.file.rows.length;
  const what =
    source.kind === "termix"
      ? t("hostTransfer.read.termixFile")
      : t("hostTransfer.read.sshConfig");
  return t("hostTransfer.read.sourceHosts", { what, count });
}

/** Reads text from a file, the clipboard or a QR code. Throws a plain message. */
export function readImportText(text: string): ImportSource {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(t("hostTransfer.read.thereIsNothingToImport"));
  if (trimmed.startsWith(SHARE_PREFIX)) {
    const shared = decodeHostShare(trimmed);
    if (!shared) throw new Error(t("hostTransfer.read.thatIsNotATermix"));
    return { kind: "link", shared };
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return { kind: "termix", file: parseImportFile(trimmed) };
  }
  return { kind: "ssh-config", file: rowsFromSshConfig(trimmed) };
}

export function sharedToFile(shared: SharedHost): ImportFile {
  const row = normalizeRow(
    {
      name: shared.name,
      ip: shared.ip,
      port: shared.port,
      username: shared.username,
      authType: shared.authType,
      folder: shared.folder,
      tags: shared.tags,
      notes: shared.notes,
      password: shared.password,
    },
    1,
  );
  return typeof row === "string"
    ? { rows: [], credentials: [], errors: [row] }
    : { rows: [row as ImportRow], credentials: [], errors: [] };
}

export async function runImport(
  repos: DataRepositories,
  source: ImportSource,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const file =
    source.kind === "link" ? sharedToFile(source.shared) : source.file;
  return importHosts(repos, file, options);
}
