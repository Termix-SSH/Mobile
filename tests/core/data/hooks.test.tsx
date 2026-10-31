import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useLiveList, useRepositories } from "@/core/data/hooks";
import { localRepositories } from "@/core/data/local";
import { localStores } from "@/core/db/stores";
import { resetStorage } from "../../helpers/http";
import { testDriver, testStores } from "../../helpers/db";

beforeEach(resetStorage);

test("a live list reloads after a write", async () => {
  const { stores } = testStores();
  const repos = localRepositories("local", stores);
  const { result } = await renderHook(() =>
    useLiveList(repos.snippets, () => repos.snippets.list()),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual([]);

  await act(async () => {
    await repos.snippets.create({ name: "up", content: "uptime" });
  });
  await waitFor(() =>
    expect(result.current.data.map((s) => s.name)).toEqual(["up"]),
  );
});

test("writes reload the list without piling up", async () => {
  const { stores } = testStores();
  const repos = localRepositories("local", stores);
  const load = jest.fn(() => repos.snippets.list());
  await renderHook(() => useLiveList(repos.snippets, load));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

  await act(async () => {
    await repos.snippets.reorder([]);
    await repos.snippets.reorder([]);
  });
  await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  load.mockClear();
  await act(async () => {
    await Promise.all([repos.snippets.reorder([]), repos.snippets.reorder([])]);
  });
  await waitFor(() => expect(load).toHaveBeenCalled());
  expect(load.mock.calls.length).toBeLessThanOrEqual(2);
});

test("errors are kept, not thrown", async () => {
  const { result } = await renderHook(() =>
    useLiveList(null, () => Promise.reject(new Error("nope"))),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toEqual(new Error("nope"));
});

test("This device is active by default and uses the local store", async () => {
  localStores.setDriver(testDriver());
  const { result } = await renderHook(() => useRepositories());
  expect(result.current.source).toBe("local");
});
