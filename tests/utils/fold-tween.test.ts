import { act, renderHook } from "@testing-library/react-native";
import { FOLD_TWEEN_MS, useFoldTweenWidth } from "@/utils/fold-tween";

type Props = { target: number; bent: boolean };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const render = (initialProps: Props) =>
  renderHook(({ target, bent }: Props) => useFoldTweenWidth(target, bent), {
    initialProps,
  });

test("a width follows drags and turns at once", async () => {
  const hook = await render({ target: 340, bent: false });
  expect(hook.result.current).toBe(340);
  await hook.rerender({ target: 400, bent: false });
  expect(hook.result.current).toBe(400);
});

test("going flat glides from the crease to the dragged width, never past it", async () => {
  const hook = await render({ target: 371.5, bent: true });
  await hook.rerender({ target: 326, bent: false });
  // The first frame still shows the crease, it doesn't jump to the new width.
  expect(hook.result.current).toBe(371.5);
  const seen: number[] = [];
  for (let t = 0; t < FOLD_TWEEN_MS + 50; t += 16) {
    await act(async () => jest.advanceTimersByTime(16));
    seen.push(hook.result.current);
  }
  // Each frame moves one way only, from the crease toward the dragged width.
  for (let i = 1; i < seen.length; i++) {
    expect(seen[i]).toBeLessThanOrEqual(seen[i - 1]);
    expect(seen[i]).toBeGreaterThanOrEqual(326);
  }
  expect(seen.some((w) => w > 326 && w < 371.5)).toBe(true);
  expect(hook.result.current).toBe(326);
});

test("bending glides to the crease and follows it if it settles a moment later", async () => {
  const hook = await render({ target: 326, bent: false });
  await hook.rerender({ target: 371.5, bent: true });
  await act(async () => jest.advanceTimersByTime(48));
  const mid = hook.result.current;
  expect(mid).toBeGreaterThan(326);
  expect(mid).toBeLessThan(371.5);
  await hook.rerender({ target: 375, bent: true });
  await act(async () => jest.advanceTimersByTime(FOLD_TWEEN_MS));
  expect(hook.result.current).toBe(375);
});
