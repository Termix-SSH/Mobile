import { Dimensions, Platform } from "react-native";
import { visibleKeyboardHeight } from "@/contexts/KeyboardContext";

const screen = (width: number, height: number) =>
  jest
    .spyOn(Dimensions, "get")
    .mockReturnValue({ width, height, scale: 3, fontScale: 1 });

afterEach(() => jest.restoreAllMocks());

describe("on iOS", () => {
  beforeAll(() => {
    Platform.OS = "ios";
  });

  test("a shown keyboard covers its height", () => {
    screen(393, 852);
    expect(
      visibleKeyboardHeight({ screenY: 516, width: 393, height: 336 }),
    ).toBe(336);
  });

  test("a frame off screen counts as hidden", () => {
    screen(393, 852);
    expect(
      visibleKeyboardHeight({ screenY: 852, width: 393, height: 336 }),
    ).toBe(0);
  });

  test("turning sideways works while the screen size is still the old one", () => {
    screen(393, 852);
    expect(
      visibleKeyboardHeight({ screenY: 184, width: 852, height: 209 }),
    ).toBe(209);
    expect(
      visibleKeyboardHeight({ screenY: 393, width: 852, height: 209 }),
    ).toBe(0);
  });

  test("an opened foldable works while the screen size is still the folded one", () => {
    jest
      .spyOn(Dimensions, "get")
      .mockImplementation((dim) =>
        dim === "screen"
          ? { width: 466, height: 678, scale: 3, fontScale: 1 }
          : { width: 951, height: 669, scale: 3, fontScale: 1 },
      );
    expect(
      visibleKeyboardHeight({ screenY: 369, width: 951, height: 300 }),
    ).toBe(300);
    expect(
      visibleKeyboardHeight({ screenY: 669, width: 951, height: 300 }),
    ).toBe(0);
  });
});
