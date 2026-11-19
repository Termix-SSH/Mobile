import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { ActivityCard } from "@/screens/home/cards/ActivityCard";
import { AlertsCard } from "@/screens/home/cards/AlertsCard";
import { PinnedCard, pinnedHosts } from "@/screens/home/cards/PinnedCard";
import { QuickCard } from "@/screens/home/cards/QuickCard";
import { RecentCard } from "@/screens/home/cards/RecentCard";
import { ServerCard } from "@/screens/home/cards/ServerCard";
import { SessionsCard } from "@/screens/home/cards/SessionsCard";
import { HomeDataContext, type HomeData } from "@/screens/home/HomeData";

const mockOpenTab = jest.fn();
const mockPush = jest.fn();
const mockNavigate = jest.fn(async () => null);
const mockSetActive = jest.fn();
let mockSessions: any[] = [];
let mockRecent: any[] = [];
let mockQuick: any[] = [];
let mockQuickConnect = false;
let mockAccount: any = { id: "s1", kind: "server", serverName: "Main" };
const mockClient: any = {
  api: {
    server: {
      getVersionInfo: jest.fn(async () => ({
        localVersion: "26.11.2",
        status: "requires_update",
      })),
      getDatabaseHealth: jest.fn(async () => ({ status: "ok" })),
    },
    homepage: {
      getUptime: jest.fn(async () => ({ formatted: "3d 4h" })),
      getRecentActivity: jest.fn(async () => [
        {
          id: 1,
          type: "terminal",
          hostId: 7,
          hostName: "web",
          timestamp: new Date().toISOString(),
        },
      ]),
    },
    alerts: {
      available: () => true,
      list: jest.fn(async () => ({
        items: [
          {
            id: "a",
            title: "Disk full",
            message: "db at 95%",
            severity: "warning",
            read: false,
          },
        ],
        unread: 4,
      })),
    },
  },
};

jest.mock("expo-router", () => ({
  router: { push: (...a: any[]) => mockPush(...a) },
}));
jest.mock("@/core/exec", () => ({
  usePoll: (task: () => void, o: { enabled?: boolean }) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      if (o.enabled !== false) void task();
    }, [task, o.enabled]);
  },
}));
jest.mock("@/screens/shell/navigate", () => ({
  openTab: (href: string) => mockOpenTab(href),
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
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
  useClient: () => (mockAccount.kind === "server" ? mockClient : null),
  accounts: { find: () => mockAccount },
  accountLabel: (a: any) => a.serverName ?? "This device",
}));
const mockRepos = {
  credentials: { list: async () => [{ id: 1 }, { id: 2 }] },
};
jest.mock("@/core/data/hooks", () => ({
  useRepositories: () => mockRepos,
}));
jest.mock("@/core/hosts/recent", () => ({
  useRecentHosts: () => mockRecent,
}));
jest.mock("@/core/sessions/status", () => ({
  useSessionStatuses: () => ({ t1: { state: "reconnecting" } }),
}));
jest.mock("@/screens/notifications/unread", () => ({ setUnread: jest.fn() }));
jest.mock("@/screens/hosts/QuickConnect", () => ({
  QuickConnect: ({ visible }: any) => {
    const { Text: T } = jest.requireActual("react-native");
    return visible ? <T>quick connect sheet</T> : null;
  },
}));
const mockCard = jest.fn((props: any) => (
  <Text>{`card ${props.host.name} ${props.active ? "on" : "off"}`}</Text>
));
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

const openHost = jest.fn();
const showHostMenu = jest.fn();
function withData(node: React.ReactNode, data: Partial<HomeData> = {}) {
  return (
    <HomeDataContext.Provider
      value={{
        hosts: [],
        hostsLoading: false,
        statuses: {},
        openHost,
        showHostMenu,
        ...data,
      }}
    >
      {node}
    </HomeDataContext.Provider>
  );
}
const props = { accountId: "s1", active: true, refreshKey: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  mockSessions = [];
  mockRecent = [];
  mockQuick = [];
  mockQuickConnect = false;
  mockAccount = { id: "s1", kind: "server", serverName: "Main" };
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
  await render(
    withData(<PinnedCard {...props} />, { hosts: [host({ pin: false })] }),
  );
  expect(screen.getByText("Pin a host to see it here")).toBeTruthy();
  await fireEvent.press(screen.getByText("Go to hosts"));
  expect(mockOpenTab).toHaveBeenCalledWith("/(tabs)/hosts");
});

test("no hosts at all guides to the first one", async () => {
  mockAccount = { id: "local", kind: "local" };
  await render(withData(<PinnedCard {...props} accountId="local" />));
  expect(screen.getByText("Add your first host")).toBeTruthy();
  await fireEvent.press(screen.getByText("Add host"));
  expect(mockOpenTab).toHaveBeenCalledWith("/(tabs)/hosts?action=new");
  expect(screen.getByText("Link a server")).toBeTruthy();
});

test("each pinned host shows its cards, and a card opens its tab", async () => {
  const hosts = [host({ enableDocker: true }), host({ id: 2, name: "db" })];
  await render(withData(<PinnedCard {...props} />, { hosts }));
  expect(screen.getByText("card web on")).toBeTruthy();
  expect(screen.getByText(/Turn on Docker or Services/)).toBeTruthy();
  await fireEvent.press(screen.getByText("card web on"));
  expect(mockNavigate).toHaveBeenCalledWith(
    expect.objectContaining({ id: 1 }),
    "docker",
  );
  await fireEvent.press(screen.getByText("db"));
  expect(openHost).toHaveBeenCalledWith(hosts[1]);
});

test("recent hosts skip pinned ones and open on tap", async () => {
  const hosts = [host({}), host({ id: 2, name: "db", pin: false })];
  mockRecent = [hosts[1], hosts[0]];
  await render(withData(<RecentCard {...props} />, { hosts }));
  expect(screen.queryByText("web")).toBeNull();
  await fireEvent.press(screen.getByText("db"));
  expect(openHost).toHaveBeenCalledWith(hosts[1]);
});

test("open sessions show with their state and switch on tap", async () => {
  mockSessions = [{ id: "t1", type: "terminal", title: "web", host: host({}) }];
  await render(<SessionsCard />);
  expect(screen.getByText("Reconnecting")).toBeTruthy();
  await fireEvent.press(screen.getByText("Reconnecting"));
  expect(mockSetActive).toHaveBeenCalledWith("t1");
  expect(mockOpenTab).toHaveBeenCalledWith("/(tabs)/sessions");
});

test("no sessions means no card", async () => {
  await render(<SessionsCard />);
  expect(screen.queryByText("Open sessions")).toBeNull();
});

test("quick connect and server screens share one card", async () => {
  mockQuickConnect = true;
  const run = jest.fn();
  mockQuick = [{ id: "x", label: "Alerts", icon: () => null, order: 1, run }];
  await render(<QuickCard />);
  await fireEvent.press(screen.getByText("Quick connect"));
  expect(screen.getByText("quick connect sheet")).toBeTruthy();
  await fireEvent.press(screen.getByText("Alerts"));
  expect(run).toHaveBeenCalledWith({ account: { id: "s1" } });
});

test("the server card shows version, health and host counts", async () => {
  const hosts = [host({ id: 1 }), host({ id: 2 }), host({ id: 3 })];
  await render(
    withData(<ServerCard {...props} />, {
      hosts,
      statuses: { 1: "online", 2: "online", 3: "offline" },
    }),
  );
  expect(await screen.findByText("26.11.2")).toBeTruthy();
  expect(screen.getByText("Main")).toBeTruthy();
  expect(screen.getByText("Update available")).toBeTruthy();
  expect(screen.getByText("3d 4h")).toBeTruthy();
  expect(screen.getByText("Healthy")).toBeTruthy();
  // Two online, two logins, three hosts, one offline.
  expect(screen.getAllByText("2")).toHaveLength(2);
  expect(screen.getByText("3")).toBeTruthy();
  expect(screen.getByText("1")).toBeTruthy();
});

test("activity rows open the host they name", async () => {
  const hosts = [host({ id: 3, serverId: 7 })];
  await render(withData(<ActivityCard {...props} />, { hosts }));
  await fireEvent.press(await screen.findByText("web"));
  expect(openHost).toHaveBeenCalledWith(hosts[0]);
});

test("no activity feed means no card", async () => {
  mockClient.api.homepage.getRecentActivity.mockRejectedValueOnce(
    new Error("404"),
  );
  await render(withData(<ActivityCard {...props} />));
  expect(screen.queryByText("Recent activity")).toBeNull();
});

test("unread notifications show with a way to the inbox", async () => {
  await render(<AlertsCard {...props} />);
  expect(await screen.findByText("Disk full")).toBeTruthy();
  expect(screen.getByText("4 unread")).toBeTruthy();
  await fireEvent.press(screen.getByText("See all"));
  expect(mockPush).toHaveBeenCalledWith("/tabs/settings/Notifications");
});
