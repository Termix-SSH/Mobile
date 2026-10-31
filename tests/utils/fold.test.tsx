import { act, renderHook } from "@testing-library/react-native";
import { FOLD_GUTTER, foldFrom, useFoldRegions } from "@/utils/fold";

let mockEmit: ((e: { folds: unknown[] }) => void) | null = null;
const mockRemove = jest.fn();

jest.mock("expo-modules-core", () => ({
  ...jest.requireActual("expo-modules-core"),
  requireOptionalNativeModule: () => ({
    getFolds: () => [],
    addListener: (_: string, cb: (e: { folds: unknown[] }) => void) => {
      mockEmit = cb;
      return { remove: mockRemove };
    },
  }),
}));

describe("foldFrom", () => {
  it("reads a flat book fold with room around the crease", () => {
    const fold = foldFrom(
      [{ x: 475.5, y: 0, width: 0, height: 669, active: false }],
      951,
      669,
    );
    expect(fold).toEqual({
      axis: "vertical",
      start: 475.5 - FOLD_GUTTER / 2,
      end: 475.5 + FOLD_GUTTER / 2,
      active: false,
    });
  });

  it("keeps a wide bent fold's own frame", () => {
    const fold = foldFrom(
      [{ x: 450, y: 0, width: 50, height: 669, active: true }],
      951,
      669,
    );
    expect(fold).toMatchObject({ start: 450, end: 500, active: true });
  });

  it("reads a fold across as horizontal", () => {
    const fold = foldFrom(
      [{ x: 0, y: 470, width: 669, height: 20, active: true }],
      669,
      951,
    );
    expect(fold).toMatchObject({ axis: "horizontal", start: 468, end: 492 });
  });

  it("ignores folds that don't cross the window", () => {
    expect(foldFrom([], 951, 669)).toBeNull();
    expect(
      foldFrom(
        [{ x: 400, y: 0, width: 0, height: 300, active: true }],
        951,
        669,
      ),
    ).toBeNull();
    expect(
      foldFrom(
        [{ x: 1200, y: 0, width: 0, height: 669, active: true }],
        951,
        669,
      ),
    ).toBeNull();
    expect(
      foldFrom([{ x: 0, y: 0, width: 0, height: 0, active: false }], 951, 669),
    ).toBeNull();
  });
});

test("useFoldRegions follows the native module", async () => {
  const { result, unmount } = await renderHook(() => useFoldRegions());
  expect(result.current).toEqual([]);
  const folds = [{ x: 475, y: 0, width: 0, height: 669, active: false }];
  await act(async () => mockEmit?.({ folds }));
  expect(result.current).toEqual(folds);
  await unmount();
  expect(mockRemove).toHaveBeenCalled();
});
