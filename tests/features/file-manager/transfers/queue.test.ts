import {
  nextToStart,
  reduceTransfers,
  summarize,
  type Transfer,
} from "@/features/file-manager/transfers/queue";

const t = (id: string, over: Partial<Transfer> = {}): Transfer => ({
  id,
  kind: "download",
  name: id,
  remotePath: `/r/${id}`,
  localPath: `/l/${id}`,
  total: 100,
  done: 0,
  state: "queued",
  ...over,
});

test("a transfer runs, pauses, resumes and finishes", () => {
  let list = reduceTransfers([], { type: "add", transfers: [t("a")] });
  list = reduceTransfers(list, { type: "start", id: "a" });
  expect(list[0]).toMatchObject({ state: "running", started: true });
  list = reduceTransfers(list, {
    type: "progress",
    id: "a",
    done: 40,
    total: 100,
  });
  list = reduceTransfers(list, { type: "pause", id: "a" });
  expect(list[0]).toMatchObject({ state: "paused", done: 40 });
  // Progress after a pause is from the stopped try and is ignored.
  list = reduceTransfers(list, {
    type: "progress",
    id: "a",
    done: 50,
    total: 100,
  });
  expect(list[0].done).toBe(40);
  list = reduceTransfers(list, { type: "resume", id: "a" });
  expect(list[0].state).toBe("queued");
  list = reduceTransfers(list, { type: "start", id: "a" });
  list = reduceTransfers(list, { type: "finish", id: "a" });
  expect(list[0]).toMatchObject({ state: "done", done: 100 });
});

test("failures can be retried, finished ones cleared", () => {
  let list = [t("a", { state: "running" }), t("b", { state: "done" })];
  list = reduceTransfers(list, { type: "fail", id: "a", error: "boom" });
  expect(list[0]).toMatchObject({ state: "failed", error: "boom" });
  list = reduceTransfers(list, { type: "retry", id: "a" });
  expect(list[0]).toMatchObject({ state: "queued", error: undefined });
  list = reduceTransfers(list, { type: "clear" });
  expect(list.map((x) => x.id)).toEqual(["a"]);
});

test("cancel only touches active transfers", () => {
  const list = [t("a", { state: "done" }), t("b", { state: "paused" })];
  const next = reduceTransfers(
    reduceTransfers(list, { type: "cancel", id: "a" }),
    { type: "cancel", id: "b" },
  );
  expect(next.map((x) => x.state)).toEqual(["done", "cancelled"]);
});

test("only as many start as the concurrency allows", () => {
  const list = [
    t("a", { state: "running" }),
    t("b"),
    t("c"),
    t("d", { state: "paused" }),
  ];
  expect(nextToStart(list, 2)).toEqual(["b"]);
  expect(nextToStart(list, 1)).toEqual([]);
  expect(nextToStart(list, 4)).toEqual(["b", "c"]);
});

test("the summary counts active bytes", () => {
  expect(
    summarize([
      t("a", { state: "running", done: 10, total: 100 }),
      t("b", { state: "failed" }),
      t("c", { state: "queued", total: -1, done: 0 }),
    ]),
  ).toEqual({ active: 2, failed: 1, done: 10, total: 100 });
});
