import { fireEvent, render, screen } from "@testing-library/react-native";
import { ApprovalsCard } from "@/features/operations/ApprovalsCard";
import { homeSnippets, SnippetsCard } from "@/features/snippets/SnippetsCard";
import { hasTunnels, TunnelsCard } from "@/features/tunnels/TunnelsCard";
import { WakeCard, wakeTargets } from "@/features/wake-on-lan/WakeCard";
import { HomeDataContext } from "@/screens/home/HomeData";

const mockDecide = jest.fn(async () => ({ runId: "r", status: "done" }));
const mockList = jest.fn();
const mockSendWake = jest.fn(async () => true);
const mockNavigate = jest.fn();
let mockSnippets: any[] = [];
const mockClient: any = {
  api: {
    tunnels: {
      getTunnelStatuses: jest.fn(async () => ({
        a: { connected: true },
        b: { connected: false },
      })),
    },
  },
};

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
}));
jest.mock("@/core/exec", () => ({
  usePoll: (task: () => void, o: { enabled?: boolean }) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      if (o.enabled !== false) void task();
    }, [task, o.enabled]);
  },
}));
jest.mock("@/core/accounts", () => ({ useClient: () => mockClient }));
jest.mock("@/utils/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/features/operations/api", () => ({
  listApprovals: (...a: any[]) => mockList(...a),
  decide: (...a: any[]) => mockDecide(...(a as [])),
  errorText: (_e: unknown, f: string) => f,
}));
jest.mock("@/features/wake-on-lan/wake", () => ({
  sendWake: (...a: any[]) => mockSendWake(...(a as [])),
}));
jest.mock("@/core/features/hooks", () => ({
  useFeatureContext: () => ({ account: { id: "s1" }, client: null }),
}));
jest.mock("@/contexts/TerminalSessionsContext", () => ({
  useTerminalSessions: () => ({ navigateToSessions: mockNavigate }),
}));
const mockRepos = { snippets: { list: async () => mockSnippets } };
jest.mock("@/core/data/hooks", () => ({
  useRepositories: () => mockRepos,
  useLiveList: () => ({ data: mockSnippets, loading: false }),
}));
jest.mock("@/features/snippets/RunOnHostsSheet", () => ({
  RunOnHostsSheet: ({ snippet }: any) => {
    const { Text } = jest.requireActual("react-native");
    return snippet ? <Text>{`running ${snippet.name}`}</Text> : null;
  },
}));

const props = { accountId: "s1", active: true, refreshKey: 0 };
const hosts = [
  { id: 1, name: "nas", ip: "10.0.0.5", macAddress: "aa:bb" },
  { id: 2, name: "pc", ip: "10.0.0.6", macAddress: "cc:dd" },
  { id: 3, name: "web", ip: "10.0.0.7" },
  {
    id: 4,
    name: "jump",
    ip: "10.0.0.8",
    enableSsh: true,
    connectionType: "ssh",
    enableTunnel: true,
    tunnelConnections: [{}, {}],
  },
] as any[];
const statuses = { 1: "online", 2: "offline" } as any;
const withData = (node: React.ReactNode) => (
  <HomeDataContext.Provider
    value={{
      hosts,
      hostsLoading: false,
      statuses,
      openHost: jest.fn(),
      openHostAs: jest.fn(),
      showHostMenu: jest.fn(),
    }}
  >
    {node}
  </HomeDataContext.Provider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockSnippets = [];
});

test("approvals are answered right from Home", async () => {
  mockList.mockResolvedValue([
    {
      id: "ap1",
      reason: "change window",
      run: { actionId: "docker.restart", hostName: "web", username: "sam" },
    },
  ]);
  await render(<ApprovalsCard {...props} />);
  expect(await screen.findByText("docker.restart")).toBeTruthy();
  await fireEvent.press(screen.getByText("Approve"));
  expect(mockDecide).toHaveBeenCalledWith(mockClient, "ap1", true);
});

test("no approvals means no card", async () => {
  mockList.mockResolvedValue([]);
  await render(<ApprovalsCard {...props} />);
  expect(screen.queryByText("Waiting for approval")).toBeNull();
});

test("snippets skip notes, follow the user's order and run in a sheet", async () => {
  mockSnippets = [
    { id: 1, name: "b", content: "b", order: 2 },
    { id: 2, name: "note", content: "x", isNote: true, order: 0 },
    { id: 3, name: "a", content: "uptime\nmore", order: 1 },
  ];
  expect(homeSnippets(mockSnippets).map((s) => s.name)).toEqual(["a", "b"]);
  await render(<SnippetsCard />);
  expect(screen.getByText("uptime")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Run a"));
  expect(screen.getByText("running a")).toBeTruthy();
});

test("wake targets have a MAC, offline ones first", async () => {
  expect(wakeTargets(hosts, statuses).map((h) => h.name)).toEqual([
    "pc",
    "nas",
  ]);
  await render(withData(<WakeCard />));
  await fireEvent.press(screen.getByLabelText("Wake pc"));
  expect(mockSendWake).toHaveBeenCalledWith(hosts[1], {
    account: { id: "s1" },
    client: null,
  });
});

test("tunnel hosts open their tunnels tab", async () => {
  expect(hosts.filter(hasTunnels).map((h) => h.name)).toEqual(["jump"]);
  await render(withData(<TunnelsCard {...props} />));
  expect(await screen.findByText("1 running on server")).toBeTruthy();
  expect(screen.getByText("2 tunnels")).toBeTruthy();
  await fireEvent.press(screen.getByText("jump"));
  expect(mockNavigate).toHaveBeenCalledWith(hosts[3], "tunnel");
});
