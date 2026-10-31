import { credentials, hosts, snippets } from "@/core/db/schema";
import { copyData, hasOwnData } from "@/core/sync/copy";
import { hashRow } from "@/core/sync/hash";
import { kindsOf, typesOf } from "@/core/sync/kinds";
import { describeReason, isSessionEnded } from "@/core/sync/reasons";
import { resetStorage } from "../../helpers/http";
import { testStores } from "../../helpers/db";

beforeEach(resetStorage);

async function twoFiles() {
  const { stores } = testStores();
  const from = (await stores.get("a")).db;
  const to = (await stores.get("b")).db;
  return { from, to };
}

test("copies with new ids and points references at the copies", async () => {
  const { from, to } = await twoFiles();
  const cred = from
    .insert(credentials)
    .values({ syncId: "c1", name: "key", authType: "password", username: "u" })
    .returning()
    .get();
  const bastion = from
    .insert(hosts)
    .values({
      syncId: "b1",
      name: "bastion",
      ip: "1.1.1.1",
      port: 22,
      username: "r",
      authType: "password",
    })
    .returning()
    .get();
  from
    .insert(hosts)
    .values({
      syncId: "h1",
      name: "web",
      ip: "10.0.0.1",
      port: 22,
      username: "r",
      authType: "credential",
      credentialId: cred.id,
      // Points at a host that is copied after it.
      jumpHosts: JSON.stringify([{ hostId: 99 }]),
    })
    .run();
  const late = from
    .insert(hosts)
    .values({
      syncId: "z9",
      name: "zz",
      ip: "9.9.9.9",
      port: 22,
      username: "r",
      authType: "password",
    })
    .returning()
    .get();
  from
    .update(hosts)
    .set({
      jumpHosts: JSON.stringify([{ hostId: late.id }, { hostId: bastion.id }]),
    })
    .run();
  from
    .insert(hosts)
    .values({
      syncId: "s1",
      name: "shared",
      ip: "2.2.2.2",
      port: 22,
      username: "r",
      authType: "password",
      sharedSource: "{}",
    })
    .run();

  const ids = ["n1", "n2", "n3", "n4", "n5"];
  const result = copyData(from, to, () => ids.shift()!);
  expect(result).toEqual({ copied: 4, skipped: 0 });

  const copied = to.select().from(hosts).all();
  expect(copied.map((h) => h.name).sort()).toEqual(["bastion", "web", "zz"]);
  expect(copied.every((h) => !["b1", "h1", "z9"].includes(h.syncId))).toBe(
    true,
  );
  const web = copied.find((h) => h.name === "web")!;
  const toCred = to.select().from(credentials).get()!;
  expect(web.credentialId).toBe(toCred.id);
  const jumpIds = JSON.parse(web.jumpHosts!).map(
    (j: { hostId: number }) => j.hostId,
  );
  const byId = new Map(copied.map((h) => [h.id, h.name]));
  expect(jumpIds.map((id: number) => byId.get(id))).toEqual(["zz", "bastion"]);
});

test("lookalikes are skipped and This device's emptiness is seen", async () => {
  const { from, to } = await twoFiles();
  expect(hasOwnData(from)).toBe(false);
  from
    .insert(snippets)
    .values({ syncId: "a", name: "Up", content: "uptime" })
    .run();
  to.insert(snippets)
    .values({ syncId: "b", name: "up ", content: "uptime" })
    .run();
  expect(hasOwnData(from)).toBe(true);
  expect(copyData(from, to)).toEqual({ copied: 0, skipped: 1 });
});

test("a row hashes the same whatever the key order or JSON spacing", () => {
  expect(
    hashRow({ a: 1, b: '{"x":1,"y":2}', syncId: "1", updatedAt: "t" }),
  ).toBe(
    hashRow({ b: '{ "y": 2, "x": 1 }', a: 1, syncId: "2", createdAt: "u" }),
  );
  expect(hashRow({ pin: true, empty: "", gone: null })).toBe(
    hashRow({ pin: 1 }),
  );
  expect(hashRow({ a: 1 })).not.toBe(hashRow({ a: 2 }));
});

test("kinds map to entity types both ways", () => {
  expect(typesOf(["snippets"])).toEqual(["snippets", "snippetFolders"]);
  expect(kindsOf(["snippets", "snippetFolders", "hosts"])).toEqual([
    "snippets",
  ]);
});

test("every reason has words and a fix", () => {
  expect(describeReason("expired")).toMatchObject({ fix: "sign_in" });
  expect(describeReason("proxy_login").fixLabel).toBe("Sign in to the proxy");
  expect(describeReason("odd thing")).toMatchObject({
    message: "odd thing",
    fix: "retry",
  });
  expect(isSessionEnded("revoked")).toBe(true);
  expect(isSessionEnded("offline")).toBe(false);
});
