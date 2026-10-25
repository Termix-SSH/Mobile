import { act, renderHook } from "@testing-library/react-native";
import { useDebouncedValue, useStableCallback } from "@/utils/hooks";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("the debounced value waits for typing to stop, and clearing is instant", async () => {
  const { result, rerender } = await renderHook(
    ({ value }: { value: string }) => useDebouncedValue(value, 150),
    { initialProps: { value: "" } },
  );
  await rerender({ value: "a" });
  await rerender({ value: "ab" });
  expect(result.current).toBe("");
  await act(async () => {
    jest.advanceTimersByTime(150);
  });
  expect(result.current).toBe("ab");
  await rerender({ value: "" });
  expect(result.current).toBe("");
});

test("the stable callback keeps its identity and calls the latest function", async () => {
  const { result, rerender } = await renderHook(
    ({ n }: { n: number }) => useStableCallback(() => n),
    { initialProps: { n: 1 } },
  );
  const first = result.current;
  await rerender({ n: 2 });
  expect(result.current).toBe(first);
  expect(result.current()).toBe(2);
});
