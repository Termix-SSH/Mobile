import { act, fireEvent, render } from "@testing-library/react-native";
import { Keyboard, Platform, type KeyboardEvent } from "react-native";
import type { BottomTabBarProps } from "expo-router/tabs";
import { CustomTabBar } from "@/components/CustomTabBar";
import { useFeatureAvailable } from "@/core/features/hooks";

jest.mock("@/core/features/hooks", () => ({ useFeatureAvailable: jest.fn() }));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#999999",
}));
jest.mock("@/utils/orientation", () => ({
  useOrientation: () => ({ isLandscape: false }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);
jest.mock("@/ui/Toast", () => ({ Toaster: () => null }));

const mockNavigate = jest.fn();
const mockEmit = jest.fn(() => ({ defaultPrevented: false }));

function props(index = 0): BottomTabBarProps {
  return {
    state: {
      index,
      routes: ["hosts", "sessions", "ai", "settings"].map((name) => ({
        key: `${name}-key`,
        name,
      })),
    },
    navigation: { navigate: mockNavigate, emit: mockEmit },
  } as unknown as BottomTabBarProps;
}

beforeEach(() => {
  jest.mocked(useFeatureAvailable).mockReturnValue(true);
  mockNavigate.mockClear();
  mockEmit.mockClear();
});

test("shows AI when available and navigates to the AI tab", async () => {
  const result = await render(<CustomTabBar {...props()} />);
  expect(useFeatureAvailable).toHaveBeenCalledWith("ai");
  await fireEvent.press(result.getByText("AI"));
  expect(mockEmit).toHaveBeenCalledWith({
    type: "tabPress",
    target: "ai-key",
    canPreventDefault: true,
  });
  expect(mockNavigate).toHaveBeenCalledWith("ai");
});

test("hides unavailable AI and keeps Settings focused after filtering", async () => {
  jest.mocked(useFeatureAvailable).mockReturnValue(false);
  const result = await render(<CustomTabBar {...props(3)} />);
  expect(result.queryByText("AI")).toBeNull();
  const settings = result.getByRole("tab", { name: "Settings" });
  expect(settings.props.accessibilityState.selected).toBe(true);
  await fireEvent.press(settings);
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("respects prevented tab presses", async () => {
  mockEmit.mockReturnValueOnce({ defaultPrevented: true });
  const result = await render(<CustomTabBar {...props()} />);
  await fireEvent.press(result.getByText("AI"));
  expect(mockNavigate).not.toHaveBeenCalled();
});

function captureKeyboard() {
  const callbacks: Record<string, () => void> = {};
  const remove = jest.fn();
  const listener = jest
    .spyOn(Keyboard, "addListener")
    .mockImplementation((event, callback) => {
      callbacks[event] = () => callback({} as KeyboardEvent);
      return { remove } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
  return { callbacks, remove, listener };
}

const realOS = Platform.OS;
afterEach(() => {
  Platform.OS = realOS;
});

test("leaves the AI tab for Hosts when AI becomes unavailable", async () => {
  jest.mocked(useFeatureAvailable).mockReturnValue(false);
  await render(<CustomTabBar {...props(2)} />);
  expect(mockNavigate).toHaveBeenCalledWith("hosts");
});

test("keeps the bar on iOS when the keyboard opens", async () => {
  Platform.OS = "ios";
  const { listener } = captureKeyboard();
  const result = await render(<CustomTabBar {...props(2)} />);
  expect(listener).not.toHaveBeenCalled();
  expect(result.getByText("AI")).toBeTruthy();
  listener.mockRestore();
});

test("hides the bar for the AI keyboard only and cleans up listeners", async () => {
  Platform.OS = "android";
  const callbacks: Record<string, () => void> = {};
  const remove = jest.fn();
  const listener = jest
    .spyOn(Keyboard, "addListener")
    .mockImplementation((event, callback) => {
      callbacks[event] = () => callback({} as KeyboardEvent);
      return { remove } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
  const result = await render(<CustomTabBar {...props(2)} />);
  await act(async () => callbacks.keyboardDidShow());
  expect(result.queryByText("AI")).toBeNull();
  await result.rerender(<CustomTabBar {...props(3)} />);
  expect(result.getByText("Settings")).toBeTruthy();
  await result.rerender(<CustomTabBar {...props(2)} />);
  expect(result.queryByText("AI")).toBeNull();
  await act(async () => callbacks.keyboardDidHide());
  expect(result.getByText("AI")).toBeTruthy();
  await result.unmount();
  expect(remove).toHaveBeenCalledTimes(2);
  listener.mockRestore();
});
