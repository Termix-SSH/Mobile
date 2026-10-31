import { visibleFiles } from "@/features/file-manager/actions";
import { fromRelayEntry } from "@/features/file-manager/backend/relay";
import { rowMeta } from "@/features/file-manager/list/FileRow";
import { sortEntries } from "@/features/file-manager/utils/fileUtils";
import { bigFileList } from "../tests/helpers/fixtures-big";
import { bench } from "./bench";

const files = bigFileList(20000);
const raw = files.map((f) => ({
  name: f.name,
  type: f.type,
  size: f.size,
  modifiedTimestamp: f.mtime,
  permissions: "-rw-r--r--",
  owner: f.owner,
}));

test("file list, 20,000 entries", () => {
  bench(
    "files: parse relay listing",
    () => raw.map((r) => fromRelayEntry("/var/data", r)),
    10,
  );
  bench("files: sort by name", () => sortEntries(files, "name"), 10);
  bench("files: sort by size", () => sortEntries(files, "size"), 10);
  bench(
    "files: search one keystroke",
    () => visibleFiles(files, "file-1", false),
    10,
  );
  // One screen of rows is about 15; a fast fling renders a few hundred.
  const screen = files.slice(0, 300);
  bench("files: row text for 300 rows", () => screen.map(rowMeta), 10);
});
