import { fireEvent, render, screen } from "@testing-library/react-native";
import Snippets from "@/screens/settings/Snippets";

const mockRepos = {
  snippets: {
    list: jest.fn(),
    subscribe: () => () => {},
    create: jest.fn(),
    update: jest.fn(),
  },
  snippetFolders: {
    list: jest.fn(async () => [{ id: 1, name: "Operations" }]),
    subscribe: () => () => {},
  },
  hosts: { list: jest.fn(async () => []), subscribe: () => () => {} },
};
jest.mock("@/core/data/hooks", () => ({ useRepositories: () => mockRepos }));
jest.mock("@/core/accounts", () => ({
  useActiveAccount: () => ({ kind: "local" }),
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
  useUiColors: () => ({}),
}));
jest.mock("@/contexts/TerminalCustomizationContext", () => ({
  useTerminalCustomization: () => ({ config: {}, updateConfig: jest.fn() }),
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock("@/widgets", () => ({ publishSnippetSnapshot: jest.fn() }));
jest.mock("@/features/snippets/RunOnHostsSheet", () => ({
  RunOnHostsSheet: () => null,
}));
jest.mock("@/features/snippets/SnippetTransferSheet", () => ({
  SnippetTransferSheet: () => null,
}));
jest.mock("@/utils/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRepos.snippets.list.mockResolvedValue([
    { id: 9, name: "Status", content: "uptime" },
  ]);
});

function expectSingleModal() {
  expect(
    screen.container.queryAll(
      (node) => node.type === "Modal" && node.props.visible,
    ),
  ).toHaveLength(1);
}

test("creating a snippet selects a folder within the editor's modal", async () => {
  await render(<Snippets />);
  await fireEvent.press(screen.getByText("New"));
  await fireEvent.changeText(
    screen.getByPlaceholderText("e.g. Update packages"),
    "Check",
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText("e.g. sudo apt update && sudo apt upgrade -y"),
    "uptime",
  );
  await fireEvent.press(screen.getByText("No folder"));
  expectSingleModal();
  await fireEvent.press(screen.getAllByText("Operations").at(-1)!);
  await fireEvent.press(screen.getByText("Create"));
  expect(mockRepos.snippets.create).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Check",
      content: "uptime",
      folder: "Operations",
    }),
  );
});

test("editing can assign a folder without opening another modal", async () => {
  await render(<Snippets />);
  await fireEvent(screen.getByText("Status"), "longPress");
  await fireEvent.press(screen.getByText("No folder"));
  expectSingleModal();
  await fireEvent.press(screen.getAllByText("Operations").at(-1)!);
  await fireEvent.press(screen.getByText("Save"));
  expect(mockRepos.snippets.update).toHaveBeenCalledWith(
    9,
    expect.objectContaining({ folder: "Operations" }),
  );
});

test("No folder clears an existing assignment", async () => {
  mockRepos.snippets.list.mockResolvedValue([
    { id: 9, name: "Status", content: "uptime", folder: "Operations" },
  ]);
  await render(<Snippets />);
  await fireEvent(screen.getByText("Status"), "longPress");
  await fireEvent.press(
    screen.getByRole("button", { name: "Select folder", expanded: false }),
  );
  await fireEvent.press(screen.getByText("No folder"));
  await fireEvent.press(screen.getByText("Save"));
  expect(mockRepos.snippets.update).toHaveBeenCalledWith(
    9,
    expect.objectContaining({ folder: "" }),
  );
});

test("cancel discards an unsaved folder selection and reopening collapses the picker", async () => {
  await render(<Snippets />);
  await fireEvent(screen.getByText("Status"), "longPress");
  await fireEvent.press(screen.getByText("No folder"));
  await fireEvent.press(screen.getAllByText("Operations").at(-1)!);
  await fireEvent.press(screen.getByRole("button", { name: "Select folder" }));
  await fireEvent.press(screen.getByText("Cancel"));
  expect(mockRepos.snippets.update).not.toHaveBeenCalled();
  await fireEvent(screen.getByText("Status"), "longPress");
  expect(
    screen.getByRole("button", { name: "Select folder" }).props
      .accessibilityState.expanded,
  ).toBe(false);
  expect(screen.getByText("No folder")).toBeTruthy();
});

test("creating without a folder sends an explicit empty assignment", async () => {
  await render(<Snippets />);
  await fireEvent.press(screen.getByText("New"));
  await fireEvent.changeText(
    screen.getByPlaceholderText("e.g. Update packages"),
    "Check",
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText("e.g. sudo apt update && sudo apt upgrade -y"),
    "uptime",
  );
  await fireEvent.press(screen.getByText("Create"));
  expect(mockRepos.snippets.create).toHaveBeenCalledWith(
    expect.objectContaining({ folder: "" }),
  );
});
