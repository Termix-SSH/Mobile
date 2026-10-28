import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  WindowSizeRoot,
  currentWindowSize,
  useWindowInfo,
  windowClassFor,
  windowInfo,
  MEDIUM_MIN_WIDTH,
  EXPANDED_MIN_WIDTH,
} from "@/utils/window-class";

describe("windowClassFor", () => {
  it("uses the width breakpoints", () => {
    expect(windowClassFor(MEDIUM_MIN_WIDTH - 1)).toBe("compact");
    expect(windowClassFor(MEDIUM_MIN_WIDTH)).toBe("medium");
    expect(windowClassFor(EXPANDED_MIN_WIDTH - 1)).toBe("medium");
    expect(windowClassFor(EXPANDED_MIN_WIDTH)).toBe("expanded");
  });
});

describe("windowInfo", () => {
  it("describes a phone in portrait", () => {
    const w = windowInfo(390, 844);
    expect(w).toMatchObject({
      windowClass: "compact",
      isPortrait: true,
      isWide: false,
      canSplit: false,
      isShort: false,
    });
  });

  it("marks a phone in landscape as short", () => {
    const w = windowInfo(844, 390);
    expect(w.isLandscape).toBe(true);
    expect(w.isShort).toBe(true);
    expect(w.canSplit).toBe(false);
    expect(w.windowClass).toBe("expanded");
  });

  it("allows split on a tablet in both orientations", () => {
    expect(windowInfo(1024, 768).canSplit).toBe(true);
    expect(windowInfo(768, 1024).canSplit).toBe(true);
  });

  it("follows a foldable unfolding", () => {
    expect(windowInfo(360, 800).isWide).toBe(false);
    expect(windowInfo(840, 900).windowClass).toBe("expanded");
  });
});

describe("WindowSizeRoot", () => {
  function Probe() {
    const w = useWindowInfo();
    return <Text testID="probe">{`${w.width}x${w.height}`}</Text>;
  }

  it("uses the measured root size over a stale window size", async () => {
    await render(
      <WindowSizeRoot>
        <Probe />
      </WindowSizeRoot>,
    );
    // The event bubbles up to the root view's handler.
    await fireEvent(screen.getByTestId("probe"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 852, height: 393 } },
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("852x393");
    expect(currentWindowSize()).toEqual({ width: 852, height: 393 });
  });
});
