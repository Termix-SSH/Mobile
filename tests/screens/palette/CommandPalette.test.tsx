import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { CommandPalette } from "@/screens/palette/CommandPalette";
import { palette } from "@/screens/palette/store";

const mockRun = jest.fn();

jest.mock("@/screens/palette/usePaletteItems", () => ({
  usePaletteItems: () => [
    {
      id: "h1",
      section: "hosts",
      label: "web-prod",
      detail: "root@10.0.0.5",
      suggested: true,
      run: mockRun,
    },
    { id: "a1", section: "actions", label: "Add host", run: jest.fn() },
  ],
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/screens/tools/HostPicker", () => ({ HostPicker: () => null }));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
  useUiColors: () => ({ brand: "#888" }),
  useTheme: () => ({ resolvedTheme: "dark" }),
}));
jest.mock("@/contexts/TerminalSessionsContext", () => ({
  useTerminalSessions: () => ({ navigateToSessions: jest.fn() }),
}));
jest.mock("@/core/data/hooks", () => ({
  useRepositories: () => ({ hosts: { list: async () => [] } }),
  useLiveList: () => ({ data: [], loading: false }),
}));

afterEach(() => act(() => palette.close()));

test("stays hidden until opened", async () => {
  await render(<CommandPalette />);
  expect(screen.queryByText("web-prod")).toBeNull();
});

test("shows suggestions, filters as you type and runs a result", async () => {
  await render(<CommandPalette />);
  await act(() => palette.open());
  expect(screen.getByText("web-prod")).toBeTruthy();
  expect(screen.queryByText("Add host")).toBeNull();

  await fireEvent.changeText(
    screen.getByPlaceholderText("Search hosts, snippets, actions"),
    "add",
  );
  expect(screen.queryByText("web-prod")).toBeNull();
  expect(screen.getByText("Add host")).toBeTruthy();

  await fireEvent.changeText(
    screen.getByPlaceholderText("Search hosts, snippets, actions"),
    "10.0",
  );
  await fireEvent.press(screen.getByText("web-prod"));
  expect(mockRun).toHaveBeenCalled();
});
