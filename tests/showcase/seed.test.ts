import { localRepositories } from "@/core/data/local";
import { SEED_HOSTS, SEED_SNIPPETS, seedShowcase } from "@/showcase/seed";
import { resetStorage } from "../helpers/http";
import { testStores } from "../helpers/db";

beforeEach(resetStorage);

test("replaces the local data with the showcase homelab", async () => {
  const { stores } = testStores();
  const repos = localRepositories("local", stores);
  await repos.hosts.create({
    name: "old",
    ip: "1.1.1.1",
    port: 22,
    username: "x",
    authType: "password",
  });

  const hosts = await seedShowcase(repos, Date.UTC(2026, 9, 27));
  const list = await repos.hosts.list();
  expect(list.map((h) => h.name).sort()).toEqual(
    SEED_HOSTS.map((h) => h.name).sort(),
  );
  expect(hosts.get("web-01")?.folder).toBe("Prod / Web");
  expect((await repos.snippets.list()).length).toBe(SEED_SNIPPETS.length);
  expect((await repos.credentials.list()).length).toBe(2);

  // Seeding twice gives the same data, not twice as much.
  await seedShowcase(repos);
  expect((await repos.hosts.list()).length).toBe(SEED_HOSTS.length);
  expect((await repos.snippetFolders.list()).length).toBe(3);
});
