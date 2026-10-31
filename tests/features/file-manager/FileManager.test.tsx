import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { ConfirmProvider } from "@/ui";
import { FileManager } from "@/features/file-manager/FileManager";
import type {
  FileBackend,
  FileEntry,
} from "@/features/file-manager/backend/types";
import { resetFileSettingsForTests } from "@/features/file-manager/settings";
import { resetStorage } from "../../helpers/http";

const COLORS = {
  background: "#000000",
  surface: "#000000",
  card: "#000000",
  muted: "#000000",
  active: "#000000",
  border: "#000000",
  text: "#ffffff",
  textMuted: "#888888",
  textFaint: "#444444",
  brand: "#ff8800",
  terminal: "#000000",
};

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
  useUiColors: () => COLORS,
  useTheme: () => ({ isDark: true }),
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-file-system", () =>
  require("../../helpers/fakeFileSystem").fakeFileSystem(),
);
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

let mockBackend: FileBackend;
jest.mock("@/features/file-manager/connection/useFileBackend", () => ({
  useFileBackend: () => ({
    state: { phase: "ready", backend: mockBackend },
    retry: jest.fn(),
    switchOrigin: jest.fn(),
    relayReady: jest.fn(),
    relayFailed: jest.fn(),
  }),
}));

const entry = (dir: string, name: string, over: Partial<FileEntry> = {}) => ({
  name,
  path: `${dir === "/" ? "" : dir}/${name}`,
  type: "file" as const,
  size: 10,
  mtime: null,
  mode: 0o644,
  ...over,
});

function fakeBackend(tree: Record<string, FileEntry[]>) {
  return {
    kind: "sftp",
    home: jest.fn(async () => "/home/u"),
    list: jest.fn(async (path: string) => ({ path, files: tree[path] ?? [] })),
    readText: jest.fn(async () => ({ text: "echo hi", size: 7 })),
    remove: jest.fn(async () => {}),
    mkdir: jest.fn(async () => {}),
    trash: null,
    symlink: null,
    close: jest.fn(),
  } as unknown as FileBackend;
}

const host = { id: 1, name: "web", defaultPath: "/" } as any;

beforeEach(async () => {
  await resetStorage();
  resetFileSettingsForTests();
});

async function show() {
  await render(
    <ConfirmProvider>
      <FileManager host={host} type="filemanager" isVisible />
    </ConfirmProvider>,
  );
  await act(async () => {});
}

test("opens home, lists folders first and walks into one", async () => {
  mockBackend = fakeBackend({
    "/home/u": [
      entry("/home/u", "notes.txt"),
      entry("/home/u", "src", { type: "directory" }),
    ],
    "/home/u/src": [entry("/home/u/src", "main.go")],
  });
  await show();
  expect(mockBackend.home).toHaveBeenCalled();
  expect(screen.getByText("notes.txt")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("src"));
  await act(async () => {});
  expect(mockBackend.list).toHaveBeenLastCalledWith("/home/u/src");
  expect(screen.getByText("main.go")).toBeTruthy();
});

test("hidden files follow the setting and search filters by name", async () => {
  mockBackend = fakeBackend({
    "/home/u": [entry("/home/u", ".env"), entry("/home/u", "app.ts")],
  });
  await show();
  expect(screen.getByText(".env")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Search"));
  await fireEvent.changeText(
    screen.getByPlaceholderText("Filter by name"),
    "app",
  );
  // The search waits for typing to stop.
  await waitFor(() => expect(screen.queryByText(".env")).toBeNull());
  expect(screen.getByText("app.ts")).toBeTruthy();
});

test("a text file opens in the editor", async () => {
  mockBackend = fakeBackend({ "/home/u": [entry("/home/u", "run.sh")] });
  await show();
  await fireEvent.press(screen.getByLabelText("run.sh"));
  await act(async () => {});
  expect(mockBackend.readText).toHaveBeenCalledWith(
    "/home/u/run.sh",
    10 * 1024 * 1024,
  );
  expect(screen.getByText("/home/u/run.sh")).toBeTruthy();
});

test("with no trash, delete asks and then deletes for good", async () => {
  mockBackend = fakeBackend({ "/home/u": [entry("/home/u", "old.log")] });
  await show();
  await fireEvent.press(screen.getByLabelText("More for old.log"));
  await fireEvent.press(await screen.findByText("Delete"));
  await act(async () => {});
  await fireEvent.press(await screen.findByText("Delete", { exact: true }));
  await act(async () => {});
  expect(mockBackend.remove).toHaveBeenCalledWith(
    [expect.objectContaining({ path: "/home/u/old.log" })],
    true,
  );
});
