import fs from "node:fs";
import path from "node:path";
import { OFFICIAL_PLUGINS, catalogEntry } from "@/core/plugins/catalog";
import { BUILT_IN_FEATURES } from "@/features";

const sources = path.join(
  __dirname,
  "../../../../Registry/official/sources.json",
);

test("ids are unique and every entry has a name", () => {
  const ids = OFFICIAL_PLUGINS.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const entry of OFFICIAL_PLUGINS) expect(entry.name).toBeTruthy();
  expect(catalogEntry("docker")?.name).toBe("Docker");
  expect(catalogEntry("not-a-plugin")).toBeNull();
});

// Only runs inside the Termix workspace, where the registry repo sits next to the app.
const inWorkspace = fs.existsSync(sources) ? test : test.skip;

inWorkspace("lists exactly the official registry's plugins", () => {
  const { repositories } = JSON.parse(fs.readFileSync(sources, "utf8")) as {
    repositories: string[];
  };
  const plugins = path.join(__dirname, "../../../../Plugins");
  const ids = repositories.map((repo) => {
    const folder = path.join(plugins, repo.split("/")[1]);
    return JSON.parse(
      fs.readFileSync(path.join(folder, "manifest.json"), "utf8"),
    ).id as string;
  });
  expect(OFFICIAL_PLUGINS.map((entry) => entry.id).sort()).toEqual(ids.sort());
});

test("every plugin a feature stands in for is official", () => {
  for (const def of BUILT_IN_FEATURES) {
    for (const id of def.plugins ?? []) {
      expect(catalogEntry(id)).not.toBeNull();
    }
  }
});

test("a feature that needs a server plugin lists it in plugins", () => {
  for (const def of BUILT_IN_FEATURES) {
    if (def.requires) expect(def.plugins).toContain(def.requires.plugin);
  }
});

test("official plugins with app screens are marked none in the catalog", () => {
  // The features decide those; a catalog kind would be ignored and go stale.
  const covered = new Set(
    BUILT_IN_FEATURES.flatMap((def) => def.plugins ?? []),
  );
  for (const id of covered) expect(catalogEntry(id)?.kind).toBe("none");
});
