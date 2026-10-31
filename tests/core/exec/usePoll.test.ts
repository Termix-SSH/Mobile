import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { usePoll } from "@/core/exec/usePoll";
import { sessionLifecycle } from "@/core/sessions/lifecycle";

let appListener: ((s: string) => void) | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(AppState, "currentState", {
    value: "active",
    configurable: true,
  });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_e, l: any) => {
    appListener = l;
    return { remove: () => (appListener = null) } as any;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

test("runs now and then on the interval", async () => {
  const task = jest.fn();
  await renderHook(() => usePoll(task, { intervalMs: 1000 }));
  await flush();
  expect(task).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(1000));
  await flush();
  expect(task).toHaveBeenCalledTimes(2);
});

test("pauses in the background and aborts the run in flight", async () => {
  let signal: AbortSignal | null = null;
  const task = jest.fn((s: AbortSignal) => {
    signal = s;
    return new Promise<void>(() => {});
  });
  await renderHook(() => usePoll(task, { intervalMs: 1000 }));
  await flush();
  await act(async () => appListener?.("background"));
  expect(signal!.aborted).toBe(true);
  await act(async () => jest.advanceTimersByTime(5000));
  expect(task).toHaveBeenCalledTimes(1);
  await act(async () => appListener?.("active"));
  expect(task).toHaveBeenCalledTimes(2);
});

test("never overlaps, and disabled or unmounted means no runs", async () => {
  let finish: () => void = () => {};
  const task = jest.fn(() => new Promise<void>((r) => (finish = r)));
  const { rerender, unmount } = await renderHook(
    ({ on }: { on: boolean }) =>
      usePoll(task, { intervalMs: 1000, enabled: on }),
    { initialProps: { on: true } },
  );
  await flush();
  await act(async () => jest.advanceTimersByTime(3000));
  expect(task).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  await flush();
  await rerender({ on: false });
  await act(async () => jest.advanceTimersByTime(5000));
  expect(task).toHaveBeenCalledTimes(1);
  await unmount();
});

test("low power mode slows it down", async () => {
  jest.spyOn(sessionLifecycle, "isLowPower", "get").mockReturnValue(true);
  const task = jest.fn();
  await renderHook(() => usePoll(task, { intervalMs: 1000 }));
  await flush();
  await act(async () => jest.advanceTimersByTime(2000));
  expect(task).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(1000));
  await flush();
  expect(task).toHaveBeenCalledTimes(2);
});
