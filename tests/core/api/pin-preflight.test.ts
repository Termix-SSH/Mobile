import { pinnedServerOk } from "@/core/api/pin-preflight";

function client(pins: string[], get: () => Promise<unknown>) {
  return {
    certPins: () => pins,
    rootBase: () => "https://termix.example",
    rawAxios: jest.fn(() => ({ get: jest.fn(get) })),
  } as never;
}

test("an unpinned server needs no check", async () => {
  const c = client([], async () => {
    throw new Error("not called");
  });
  await expect(pinnedServerOk(c)).resolves.toBe(true);
});

test("a pinned server that answers through the pinned network passes", async () => {
  await expect(
    pinnedServerOk(client(["K"], async () => ({ status: 404 }))),
  ).resolves.toBe(true);
});

test("a pinned server that shows another key is refused", async () => {
  await expect(
    pinnedServerOk(
      client(["K"], async () => {
        throw new Error("PIN_MISMATCH: the server's key is not the pinned one");
      }),
    ),
  ).resolves.toBe(false);
});
