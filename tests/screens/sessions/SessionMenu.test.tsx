import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SessionMenu } from "@/screens/sessions/SessionMenu";

const mockConfirm = jest.fn(async () => true);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
  useUiColors: () => ({ brand: "#888" }),
  useTheme: () => ({ resolvedTheme: "dark" }),
}));
jest.mock("@/ui/Confirm", () => ({
  useConfirm: () => mockConfirm,
  ConfirmProvider: ({ children }: any) => children,
}));
jest.mock("@/core/accounts", () => ({
  accounts: { find: () => null, active: () => ({ id: "local" }) },
  useClient: () => null,
}));
jest.mock("@/core/features", () => ({
  features: { sessionMenuItems: () => [] },
}));

const tab = (id: string, title: string) =>
  ({ id, title, accountId: "local", type: "terminal", host: {} }) as any;

const base = {
  index: 0,
  count: 2,
  handle: null,
  onClose: jest.fn(),
  onRename: jest.fn(),
  onDuplicate: jest.fn(),
  onMove: jest.fn(),
  onCloseTab: jest.fn(),
  onView: jest.fn(),
};

test("split view picks another tab", async () => {
  const onSplit = jest.fn();
  await render(
    <SessionMenu
      {...base}
      session={tab("a", "web")}
      splitTargets={[tab("b", "db")]}
      onSplit={onSplit}
    />,
  );
  await fireEvent.press(screen.getByText("Split view with..."));
  await fireEvent.press(screen.getByText("db"));
  expect(onSplit).toHaveBeenCalledWith("b");
});

test("a split tab can end it, and phones get no split row", async () => {
  const onSplit = jest.fn();
  const { rerender } = await render(
    <SessionMenu
      {...base}
      session={tab("a", "web")}
      splitOn
      onSplit={onSplit}
    />,
  );
  await fireEvent.press(screen.getByText("End split view"));
  expect(onSplit).toHaveBeenCalledWith(null);

  await rerender(
    <SessionMenu {...base} session={tab("a", "web")} onSplit={onSplit} />,
  );
  expect(screen.queryByText("Split view with...")).toBeNull();
});

test("close all asks first", async () => {
  const onCloseAll = jest.fn();
  await render(
    <SessionMenu {...base} session={tab("a", "web")} onCloseAll={onCloseAll} />,
  );
  await act(async () => {
    fireEvent.press(screen.getByText("Close all tabs"));
  });
  expect(mockConfirm).toHaveBeenCalled();
  expect(onCloseAll).toHaveBeenCalled();
});
