import { render, screen } from "@testing-library/react-native";
import { ConnectionsPanel } from "@/screens/sessions/ConnectionsPanel";

const host = { id: 11, name: "web", username: "user", ip: "web.lan" };

let mockSessions: any[] = [];
let mockRecords: any[] = [];

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
}));
jest.mock("@/ui/Confirm", () => ({
  useConfirm: () => jest.fn(async () => true),
  ConfirmProvider: ({ children }: any) => children,
}));
jest.mock("@/contexts/TerminalSessionsContext", () => ({
  useTerminalSessions: () => ({
    sessions: mockSessions,
    activeSessionId: mockSessions[0]?.id ?? null,
    backgroundTabRecords: mockRecords,
    refreshBackgroundTabs: async () => {},
  }),
}));
jest.mock("@/core/features", () => {
  const tab = {
    type: "terminal",
    icon: () => null,
    shortLabel: () => "SSH",
    toServerTabType: () => "terminal",
  };
  return {
    features: {
      sessionTab: () => tab,
      sessionTabForServerType: () => ({ tab, opts: {} }),
      canOpen: () => true,
      sessionHas: () => true,
    },
    useFeatureContext: () => undefined,
  };
});
jest.mock("@/core/accounts", () => {
  const client = {
    api: {
      openTabs: { getActiveSessions: async () => [] },
      hosts: {
        getSSHHosts: async () => [
          { id: 11, name: "web", username: "user", ip: "web.lan" },
        ],
      },
    },
  };
  return {
    accounts: {
      active: () => ({ id: "server" }),
      activeClient: () => client,
      client: () => client,
    },
    api: () => client.api,
  };
});

const session = (id: string, title: string, extra: object = {}) => ({
  id,
  instanceId: `i-${id}`,
  accountId: "server",
  type: "terminal",
  host,
  title,
  ...extra,
});

const record = (id: string, label: string) => ({
  id,
  userId: "u",
  tabType: "terminal",
  hostId: 11,
  label,
  tabOrder: 0,
  backendSessionId: null,
  createdAt: "",
  updatedAt: "",
});

test("open tabs on the same host show the titles their tabs show", async () => {
  mockSessions = [
    session("a", "web", { shellTitle: "Fix the build" }),
    session("b", "web (2)"),
    session("c", "web (3)", { customTitle: "logs", shellTitle: "vim" }),
  ];
  mockRecords = [];
  await render(<ConnectionsPanel />);
  expect(screen.getByText("Fix the build")).toBeTruthy();
  expect(screen.getByText("web (2)")).toBeTruthy();
  expect(screen.getByText("logs")).toBeTruthy();
  expect(screen.queryByText("web")).toBeNull();
});

test("background tabs show their saved label, else the host name", async () => {
  mockSessions = [];
  mockRecords = [record("r1", "web (2)"), record("r2", " ")];
  await render(<ConnectionsPanel />);
  expect(screen.getByText("web (2)")).toBeTruthy();
  expect(await screen.findByText("web")).toBeTruthy();
});
