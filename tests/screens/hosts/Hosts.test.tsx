import { act, fireEvent, render, screen } from "@testing-library/react-native";
import Hosts from "@/screens/hosts/Hosts";

const mockOpenHost = jest.fn(async () => true);
const mockNavigate = jest.fn(async () => null);
const mockBulk = jest.fn(async () => {});
const mockReorder = jest.fn(async () => {});
const mockRemove = jest.fn(async () => {});
const mockConfirm = jest.fn(async () => true);
let mockHosts: any[] = [];

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/utils/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/components/Screen", () => ({
  Screen: ({ children, headerRight }: any) => (
    <>
      {headerRight}
      {children}
    </>
  ),
}));
jest.mock("@/screens/shell/AppHeader", () => ({
  AccountButton: () => null,
  SearchButton: () => null,
}));
jest.mock("@/screens/home/ServerReachBanner", () => ({
  ServerReachBanner: () => null,
}));
jest.mock("@/screens/hosts/SyncBanner", () => ({ SyncBanner: () => null }));
jest.mock("@/screens/hosts/editor/HostEditor", () => () => null);
jest.mock("@/screens/hosts/CredentialListModal", () => () => null);
jest.mock("@/screens/hosts/QuickConnect", () => ({ QuickConnect: () => null }));
jest.mock("@/features/tailscale/TailscaleDevices", () => ({
  TailscaleDevices: () => null,
}));
jest.mock("@/screens/hosts/HostActionSheet", () => ({
  HostActionSheet: ({ host, visible, onSelect }: any) => {
    const { Text, Pressable } = jest.requireActual("react-native");
    return visible ? (
      <Pressable onPress={() => onSelect(host)}>
        <Text>{`sheet ${host.name}`}</Text>
      </Pressable>
    ) : null;
  },
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
  useTerminalSessions: () => ({ navigateToSessions: mockNavigate }),
}));
jest.mock("@/core/features", () => ({
  useCapability: () => false,
  useHostFilters: () => [],
  useSettingsLinks: () => [],
  useHostBadges: () => [],
}));
jest.mock("@/screens/hosts/useOpenHost", () => ({
  useOpenHost: () => mockOpenHost,
}));
jest.mock("@/ui/Confirm", () => ({
  useConfirm: () => mockConfirm,
  ConfirmProvider: ({ children }: any) => children,
}));
jest.mock("@/screens/hosts/useHostsData", () => ({
  useHostsData: () => ({
    repos: {
      hosts: {
        bulkUpdate: mockBulk,
        reorder: mockReorder,
        remove: mockRemove,
      },
    },
    hosts: mockHosts,
    folderColors: {},
    loading: false,
    refreshing: false,
    alerts: [],
    dismissAlert: jest.fn(),
    metrics: {},
    getHostStatus: () => "online",
    refresh: jest.fn(),
  }),
}));
jest.mock("react-native-draggable-flatlist", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: ({ data, renderItem, ListEmptyComponent, keyExtractor }: any) => (
      <View>
        {data.length === 0
          ? ListEmptyComponent
          : data.map((item: any, index: number) => (
              <View key={keyExtractor(item)}>
                {renderItem({
                  item,
                  drag: jest.fn(),
                  isActive: false,
                  getIndex: () => index,
                })}
              </View>
            ))}
      </View>
    ),
  };
});

const host = (id: number, name: string, extra: object = {}) =>
  ({ id, name, ip: `10.0.0.${id}`, folder: "", tags: [], ...extra }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockHosts = [
    host(1, "web"),
    host(2, "db"),
    host(3, "shared", { shared: {} }),
  ];
});

test("one tap opens the host, a hold opens its sheet", async () => {
  await render(<Hosts />);
  await fireEvent.press(screen.getByText("web"));
  expect(mockOpenHost).toHaveBeenCalledWith(mockHosts[0]);
  await fireEvent(screen.getByText("db"), "longPress");
  expect(screen.getByText("sheet db")).toBeTruthy();
});

test("a host with nothing to open shows its sheet instead", async () => {
  mockOpenHost.mockResolvedValueOnce(false);
  await render(<Hosts />);
  await act(async () => {
    fireEvent.press(screen.getByText("web"));
  });
  expect(screen.getByText("sheet web")).toBeTruthy();
});

test("multi select pins own hosts and skips shared ones", async () => {
  await render(<Hosts />);
  await fireEvent(screen.getByText("web"), "longPress");
  await fireEvent.press(screen.getByText("sheet web"));
  expect(screen.getByText("1 selected")).toBeTruthy();
  // Taps now select instead of opening.
  await fireEvent.press(screen.getByText("shared"));
  expect(mockOpenHost).not.toHaveBeenCalled();
  expect(screen.getByText("2 selected")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Pin"));
  });
  expect(mockBulk).toHaveBeenCalledWith([1], { pin: true });
});

test("bulk delete asks first", async () => {
  await render(<Hosts />);
  await fireEvent(screen.getByText("web"), "longPress");
  await fireEvent.press(screen.getByText("sheet web"));
  await fireEvent.press(screen.getByText("db"));
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Delete"));
  });
  expect(mockConfirm).toHaveBeenCalled();
  expect(mockRemove.mock.calls).toEqual([[1], [2]]);
});

test("no hosts guides to the first one", async () => {
  mockHosts = [];
  await render(<Hosts />);
  expect(screen.getByText("No hosts yet")).toBeTruthy();
  expect(screen.getAllByText("Add host").length).toBeGreaterThan(0);
  expect(screen.getByText("Link a server")).toBeTruthy();
});
