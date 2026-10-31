import fs from "node:fs";
import path from "node:path";
import { SHELL_CWD_COMMAND } from "@/core/transport/local/shell-cwd";

const plugin = path.join(
  __dirname,
  "../../../../../Plugins/Plugin-SSH-Terminal/src/backend/shell-cwd.ts",
);

test("the command runs under sh", () => {
  expect(SHELL_CWD_COMMAND.startsWith("sh -c '")).toBe(true);
});

const ownTest = fs.existsSync(plugin) ? test : test.skip;

// The plugin sits next to the app in the workspace, not in CI.
ownTest("the copy matches Plugin-SSH-Terminal", () => {
  const own = fs.readFileSync(
    path.join(__dirname, "../../../../src/core/transport/local/shell-cwd.ts"),
    "utf8",
  );
  const body = (source: string) =>
    source.slice(source.indexOf("/**")).replace(/\s+/g, "");
  expect(body(own)).toBe(body(fs.readFileSync(plugin, "utf8")));
});
