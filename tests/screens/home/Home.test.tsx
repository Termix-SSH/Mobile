import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import Home, { pinnedHosts } from "@/screens/home/Home";
import { unreachable } from "@/screens/home/ServerReachBanner";

const mockOpenTab = jest.fn();
const mockNavigate = jest.fn(async () => null);
const mockOpenHost = jest.fn(async () => true);
const mockSetActive = jest.fn();
let mockHosts: any[] = [];
let mockQuick: any[] = [];
let mockRecent: any[] = [];
let mockSessions: any[] = [];
let mockQuickConnect = false;
const mockCard = jest.fn((props: any) => (
  <Text>{`card ${props.host.name} ${props.active ? "on" : "off"}`}</Text>
));

jest.mock("expo-router", () => ({
  useFocusEffect: (fn: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(fn, [fn]);
  },
}));
jest.mock("@/screens/shell/navigate", () => ({
  openTab: (href: string) => mockOpenTab(href),
}));
jest.mock("@/components/Screen", () => ({
  Screen: ({ children }: any) => children,
}));
jest.mock("@/screens/shell/AppHeader", () => ({
  AccountButton: () => null,
  SearchButton: () => null,
}));
jest.mock("@/screens/home/ServerReachBanner", () => ({
  ...jest.requireActual("@/screens/home/ServerReachBanner"),
  ServerReachBanner: () => null,
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
  useUiColors: () => ({ brand: "#888" }),
  useTheme: () => ({ resolvedTheme: "dark" }),
}));
jest.mock("@/contexts/AppContext", () => ({
  useAppContext: () => ({ openAuthFlow: jest.fn() }),
}));
jest.mock("@/contexts/TerminalSessionsContext", () => ({
  useTerminalSessions: () => ({
    navigateToSessions: mockNavigate,
    sessions: mockSessions,
    activeSessionId: null,
    setActiveSession: mockSetActive,
  }),
}));
jest.mock("@/core/accounts", () => ({
  useAccounts: () => ({ active: { id: "local", kind: "local" } }),
}));
jest.mock("@/core/data/hooks", () => ({
  useRepositories: () => ({ hosts: { list: async () => mockHosts } }),
  useLiveList: () => ({ data: mockHosts, loading: false }),
}));
jest.mock("@/core/hosts/recent", () => ({
  useRecentHosts: () => mockRecent,
}));
jest.mock("@/core/sessions/status", () => ({
  useSessionStatuses: () => ({ t1: { state: "reconnecting" } }),
}));
jest.mock("@/screens/hosts/useOpenHost", () => ({
  useOpenHost: () => mockOpenHost,
}));
jest.mock("@/screens/hosts/QuickConnect", () => ({
  QuickConnect: ({ visible }: any) => {
    const { Text: T } = jest.requireActual("react-native");
    return visible ? <T>quick connect sheet</T> : null;
  },
}));
jest.mock("@/core/features/hooks", () => ({
  useCapability: () => mockQuickConnect,
  useQuickActions: () => ({
    ctx: { account: { id: "s1" } },
    actions: mockQuick,
  }),
  useDashboardCards: (host: any) =>
    host.enableDocker
      ? [
          {
            id: "docker",
            title: "Docker",
            order: 1,
            tabType: "docker",
            component: mockCard,
          },
        ]
      : [],
}));
jest.mock("@/screens/hosts/HostActionSheet", () => ({
  HostActionSheet: () => null,
}));

const host = (over: object) =>
  ({
    id: 1,
    name: "web",
    ip: "10.0.0.1",
    username: "u",
    enableSsh: true,
    pin: true,
    ...over,
  }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuick = [];
  mockRecent = [];
  mockSessions = [];
  mockQuickConnect = false;
});

test("pinned hosts only, in name order", () => {
  const list = pinnedHosts([
    host({ id: 1, name: "b" }),
    host({ id: 2, name: "a" }),
    host({ id: 3, name: "c", pin: false }),
  ]);
  expect(list.map((h) => h.name)).toEqual(["a", "b"]);
});

test("nothing pinned shows how to pin, with a way to the hosts", async () => {
  mockHosts = [host({ pin: false })];
  await render(<Home />);
  expect(screen.getByText("Pin a host to see it here")).toBeTruthy();
  await fireEvent.press(screen.getByText("Go to hosts"));
  expect(mockOpenTab).toHaveBeenCalledWith("/(tabs)/hosts");
});

test("no hosts at all guides to the first one", async () => {
  mockHosts = [];
  await render(<Home />);
  expect(screen.getByText("Add your first host")).toBeTruthy();
  await fireEvent.press(screen.getByText("Add host"));
  expect(mockOpenTab).toHaveBeenCalledWith("/(tabs)/hosts?action=new");
  expect(screen.getByText("Link a server")).toBeTruthy();
});

test("each pinned host shows its cards, and a card opens its tab", async () => {
  mockHosts = [host({ enableDocker: true }), host({ id: 2, name: "db" })];
  await render(<Home />);
  expect(screen.getByText("card web on")).toBeTruthy();
  expect(screen.getByText(/Turn on Docker or Services/)).toBeTruthy();
  await fireEvent.press(screen.getByText("card web on"));
  expect(mockNavigate).toHaveBeenCalledWith(
    expect.objectContaining({ id: 1 }),
    "docker",
  );
});

test("one tap on a pinned or recent host opens it", async () => {
  mockHosts = [host({}), host({ id: 2, name: "db", pin: false })];
  mockRecent = [mockHosts[1], mockHosts[0]];
  await render(<Home />);
  await fireEvent.press(screen.getByText("web"));
  expect(mockOpenHost).toHaveBeenCalledWith(mockHosts[0]);
  // A pinned host is not listed again under Recent.
  expect(screen.getAllByText("web")).toHaveLength(1);
  await fireEvent.press(screen.getByText("db"));
  expect(mockOpenHost).toHaveBeenCalledWith(mockHosts[1]);
});

test("open sessions show with their state and switch on tap", async () => {
  mockHosts = [host({})];
  mockSessions = [
    { id: "t1", type: "terminal", title: "web", host: mockHosts[0] },
  ];
  await render(<Home />);
  expect(screen.getByText("Open sessions")).toBeTruthy();
  expect(screen.getByText("Reconnecting")).toBeTruthy();
  await fireEvent.press(screen.getByText("Reconnecting"));
  expect(mockSetActive).toHaveBeenCalledWith("t1");
  expect(mockOpenTab).toHaveBeenCalledWith("/(tabs)/sessions");
});

test("quick connect shows when a feature offers it", async () => {
  mockHosts = [host({})];
  mockQuickConnect = true;
  await render(<Home />);
  await fireEvent.press(screen.getByText("Quick connect"));
  expect(screen.getByText("quick connect sheet")).toBeTruthy();
});

test("quick actions from features run on tap", async () => {
  mockHosts = [];
  const run = jest.fn();
  mockQuick = [
    {
      id: "webview:alerts:alerts",
      label: "Alerts",
      icon: () => null,
      order: 1,
      run,
    },
  ];
  await render(<Home />);
  expect(screen.getByText("From your server")).toBeTruthy();
  await fireEvent.press(screen.getByText("Alerts"));
  expect(run).toHaveBeenCalledWith({ account: { id: "s1" } });
});

test("the reach banner only shows for a server that can't be reached", () => {
  const off = { state: "off", reason: null, lastSyncAt: null, live: false };
  const server = (status: string) =>
    ({ kind: "server", status, options: {} }) as any;
  expect(unreachable({ kind: "local" } as any, off as any)).toBe(false);
  expect(unreachable(server("idle"), off as any)).toBe(false);
  expect(unreachable(server("offline"), off as any)).toBe(true);
  expect(
    unreachable(server("idle"), { ...off, reason: "offline" } as any),
  ).toBe(true);
  expect(unreachable(server("signed_out"), off as any)).toBe(false);
});
