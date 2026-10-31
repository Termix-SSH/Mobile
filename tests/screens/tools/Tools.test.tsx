import { fireEvent, render, screen } from "@testing-library/react-native";
import Tools from "@/screens/tools/Tools";
import { matchHosts } from "@/screens/tools/HostPicker";

const mockPush = jest.fn();
const mockNavigate = jest.fn(async () => null);
let mockTools: any[] = [];
const mockHosts = [
  { id: 1, name: "web", ip: "10.0.0.1", enableDocker: true },
  { id: 2, name: "db", ip: "10.0.0.2", tags: ["prod"] },
];

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/components/Screen", () => ({
  Screen: ({ children }: any) => children,
}));
jest.mock("@/screens/shell/AppHeader", () => ({
  AccountButton: () => null,
  SearchButton: () => null,
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
  useUiColors: () => ({ brand: "#888" }),
  useTheme: () => ({ resolvedTheme: "dark" }),
}));
jest.mock("@/contexts/TerminalSessionsContext", () => ({
  useTerminalSessions: () => ({ navigateToSessions: mockNavigate }),
}));
jest.mock("@/core/data/hooks", () => ({
  useRepositories: () => ({ hosts: { list: async () => mockHosts } }),
  useLiveList: () => ({ data: mockHosts, loading: false }),
}));
jest.mock("@/core/features", () => ({
  useTools: () => mockTools,
  useQuickActions: () => ({ ctx: {}, actions: [] }),
}));
jest.mock("@/ui/Sheet", () => {
  const { View } = jest.requireActual("react-native");
  return {
    Sheet: ({ visible, children }: any) =>
      visible ? <View testID="sheet">{children}</View> : null,
    SheetRow: () => null,
    SheetBody: ({ children }: any) => children,
  };
});

const Icon = () => null;

beforeEach(() => {
  mockPush.mockClear();
  mockNavigate.mockClear();
  mockTools = [
    {
      id: "docker",
      label: "Docker",
      icon: Icon,
      order: 1,
      tabType: "docker",
      isAvailable: (h: any) => !!h.enableDocker,
    },
    { id: "snippets", label: "Snippets", icon: Icon, order: 2, href: "/s" },
  ];
});

test("a host tool asks for a host, then opens its tab there", async () => {
  await render(<Tools />);
  await fireEvent.press(screen.getByText("Docker"));
  expect(screen.queryByText("db")).toBeNull();
  await fireEvent.press(screen.getByText("web"));
  expect(mockNavigate).toHaveBeenCalledWith(mockHosts[0], "docker");
});

test("a screen tool opens its route", async () => {
  await render(<Tools />);
  await fireEvent.press(screen.getByText("Snippets"));
  expect(mockPush).toHaveBeenCalledWith("/s");
});

test("matchHosts searches name, address and tags", () => {
  expect(matchHosts(mockHosts as any, "prod").map((h) => h.id)).toEqual([2]);
  expect(matchHosts(mockHosts as any, "10.0.0.1").map((h) => h.id)).toEqual([
    1,
  ]);
  expect(matchHosts(mockHosts as any, "").map((h) => h.name)).toEqual([
    "db",
    "web",
  ]);
});
