import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { DIVIDER_WIDTH, SplitDivider } from "@/screens/sessions/SplitDivider";
import { FOLD_TWEEN_MS } from "@/utils/fold-tween";

const touch = {
  touchHistory: {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: 1,
    touchBank: [
      {
        touchActive: true,
        startPageX: 0,
        startPageY: 0,
        startTimeStamp: 1,
        currentPageX: 0,
        currentPageY: 0,
        currentTimeStamp: 1,
        previousPageX: 0,
        previousPageY: 0,
        previousTimeStamp: 1,
      },
    ],
  },
  nativeEvent: { touches: [], changedTouches: [] },
};

const handlers = () => ({
  onStart: jest.fn(),
  onMove: jest.fn(),
  onEnd: jest.fn(),
});

test("bending mid drag doesn't leave the handle showing a drag once flat again", async () => {
  const props = handlers();
  const view = await render(<SplitDivider label="Resize" {...props} />);
  await act(async () =>
    fireEvent(screen.getByLabelText("Resize"), "responderGrant", touch),
  );
  expect(props.onStart).toHaveBeenCalled();
  expect(screen.getByLabelText("Resize").props.className).toContain(
    "bg-accent-brand",
  );
  // The screen bends before the finger lifts, so no release ever comes.
  await view.rerender(<SplitDivider label="Resize" locked {...props} />);
  // Locked, it's a plain line that screen readers skip.
  expect(screen.queryByLabelText("Resize")).toBeNull();
  expect(
    screen.getByTestId("split-divider-line", { includeHiddenElements: true }),
  ).toBeTruthy();
  await view.rerender(<SplitDivider label="Resize" {...props} />);
  expect(screen.getByLabelText("Resize").props.className).not.toContain(
    "bg-accent-brand",
  );
});

test("the handle glides off the crease when the screen goes flat", async () => {
  jest.useFakeTimers();
  try {
    const props = handlers();
    const width = () =>
      [screen.getByLabelText("Resize").props.style]
        .flat(Infinity)
        .reduce((w, s) => s?.width ?? w, undefined);
    const view = await render(
      <SplitDivider label="Resize" width={18} glideKey="flat" {...props} />,
    );
    expect(width()).toBe(18);
    await view.rerender(
      <SplitDivider label="Resize" glideKey="dragged" {...props} />,
    );
    // It starts on the crease rather than jumping to the thin bar.
    expect(width()).toBe(18);
    await act(async () => jest.advanceTimersByTime(48));
    expect(width()).toBeLessThan(18);
    expect(width()).toBeGreaterThan(DIVIDER_WIDTH);
    await act(async () => jest.advanceTimersByTime(FOLD_TWEEN_MS));
    expect(width()).toBe(DIVIDER_WIDTH);
  } finally {
    jest.useRealTimers();
  }
});
