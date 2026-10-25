import { mapLimit, mapSettled } from "@/utils/limit";

test("never runs more than the limit at once and keeps the order", async () => {
  let running = 0;
  let most = 0;
  const out = await mapLimit([5, 1, 4, 2, 3], 2, async (n) => {
    running++;
    most = Math.max(most, running);
    await new Promise((r) => setTimeout(r, n));
    running--;
    return n * 10;
  });
  expect(out).toEqual([50, 10, 40, 20, 30]);
  expect(most).toBe(2);
});

test("settled keeps going after a failure", async () => {
  const out = await mapSettled([1, 2, 3], 1, async (n) => {
    if (n === 2) throw new Error("no");
    return n;
  });
  expect(out.map((r) => r.status)).toEqual([
    "fulfilled",
    "rejected",
    "fulfilled",
  ]);
});

test("mapLimit throws the first failure and handles an empty list", async () => {
  await expect(
    mapLimit([1, 2], 4, async (n) => {
      if (n === 2) throw new Error("bad");
      return n;
    }),
  ).rejects.toThrow("bad");
  await expect(mapLimit([], 4, async () => 1)).resolves.toEqual([]);
});
