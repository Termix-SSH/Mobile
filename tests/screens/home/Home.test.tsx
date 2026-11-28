import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Home from "@/screens/home/Home";
import { clearHomeLayoutCache } from "@/screens/home/layout";
import { unreachable } from "@/screens/home/ServerReachBanner";

const mockConfirm = jest.fn(async () => true);
let mockSplit = false;
let mockFeatureCards: any[] = [];
let mockDragEnd: ((e: { data: any[] }) => void) | null = null;

const card = (id: string, order: number, extra: object = {}) => ({
  id,
  title: `${id} card`,
  icon: (): null => null,
  order,
  component: (props: any) => (
    <Text>{`${id}${props.instance ? `:${props.instance}` : ""} ${props.active ? "on" : "off"}`}</Text>
  ),
  ...extra,
});

jest.mock("@/screens/home/cards", () => ({
  CORE_HOME_CARDS: [
    {
      id: "server",
      title: "Server",
      icon: (): null => null,
      order: 10,
      isAvailable: (ctx: any) => ctx.account.kind === "server",
      component: () => {
        const { Text: T } = jest.requireActual("react-native");
        return <T>server</T>;
      },
    },
    {
      id: "sessions",
      title: "Open sessions",
      icon: (): null => null,
      order: 20,
      component: () => {
        const { Text: T } = jest.requireActual("react-native");
        return <T>sessions</T>;
      },
    },
  ],
  pinnedHosts: () => [],
}));
jest.mock("expo-router", () => ({
  useFocusEffect: (fn: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(fn, [fn]);
  },
}));
jest.mock("@/screens/shell/navigate", () => ({ openTab: jest.fn() }));
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
  NotificationsButton: () => null,
}));
jest.mock("@/screens/home/ServerReachBanner", () => ({
  ...jest.requireActual("@/screens/home/ServerReachBanner"),
  ServerReachBanner: () => null,
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
}));
jest.mock("@/ui", () => ({
  ...jest.requireActual("@/ui"),
  useConfirm: () => mockConfirm,
  FakeSwitch: ({ checked, onChange, accessibilityLabel }: any) => {
    const { Pressable, Text: T } = jest.requireActual("react-native");
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        onPress={() => onChange(!checked)}
      >
        <T>{checked ? "shown" : "hidden"}</T>
      </Pressable>
    );
  },
}));
jest.mock("@/core/accounts", () => ({
  useAccounts: () => ({ active: { id: "a1", kind: "local" } }),
}));
jest.mock("@/core/data/hooks", () => ({
  useRepositories: () => ({ hosts: { list: async () => [] } }),
  useLiveList: () => ({ data: [], loading: false }),
}));
let mockFold: any = null;
jest.mock("@/utils/window-class", () => ({
  useWindowInfo: () => ({
    canSplit: mockSplit,
    fold: mockFold,
    width: 900,
    height: 700,
    verticalBar: null,
  }),
}));
jest.mock("@/core/status", () => ({ useHostStatuses: () => ({}) }));
const mockCtx = { account: { id: "a1", kind: "local" }, client: null };
let mockCardsValue: any = null;
jest.mock("@/core/features/hooks", () => ({
  useHomeCards: () => {
    // The real hook memoizes, so keep one value per card list.
    if (mockCardsValue?.cards !== mockFeatureCards) {
      mockCardsValue = { ctx: mockCtx, cards: mockFeatureCards };
    }
    return mockCardsValue;
  },
}));
jest.mock("@/screens/hosts/useOpenHost", () => ({
  useOpenHost: () => async () => true,
  useOpenHostAs: () => async () => true,
}));
jest.mock("@/screens/hosts/HostActionSheet", () => ({
  HostActionSheet: () => null,
}));
jest.mock("react-native-draggable-flatlist", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    ScaleDecorator: ({ children }: any) => children,
    default: ({ data, renderItem, keyExtractor, onDragEnd }: any) => {
      mockDragEnd = onDragEnd;
      return (
        <View>
          {data.map((item: any, index: number) => (
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
      );
    },
  };
});

beforeEach(async () => {
  jest.clearAllMocks();
  clearHomeLayoutCache();
  await AsyncStorage.clear();
  mockFeatureCards = [];
  mockDragEnd = null;
  mockSplit = false;
  mockFold = null;
});

const texts = () =>
  screen
    .queryAllByText(/ (on|off)$|^sessions$|^server$/)
    .map((n) => n.props.children);

test("a fresh Home shows the available cards in order", async () => {
  mockFeatureCards = [
    card("snippets", 70),
    card("approvals", 35, { defaultOn: false }),
  ];
  await render(<Home />);
  await screen.findByText("sessions");
  // The server card needs a linked server; approvals start hidden.
  expect(texts()).toEqual(["sessions", "snippets on"]);
});

test("cards with instances show one card each", async () => {
  mockFeatureCards = [
    card("homepage", 60, {
      instances: async () => [
        { key: "5", title: "Media" },
        { key: "links", title: "Links", defaultOn: false },
        { key: "6", title: "Services" },
      ],
    }),
  ];
  await render(<Home />);
  await screen.findByText("homepage:6 on");
  expect(texts()).toEqual(["sessions", "homepage:5 on", "homepage:6 on"]);
});

test("tablets lay cards out in two columns, row by row", async () => {
  mockSplit = true;
  mockFeatureCards = [card("snippets", 70), card("wake", 85)];
  await render(<Home />);
  await screen.findByText("wake on");
  // Left column first: cards 1 and 3, then card 2 on the right.
  expect(texts()).toEqual(["sessions", "wake on", "snippets on"]);
});

test("a book fold puts the gap between the columns on the crease", async () => {
  // Bent like a book; the card row starts 96pt in, past the rail.
  mockFold = { axis: "vertical", start: 428, end: 452, active: true };
  mockFeatureCards = [card("snippets", 70), card("wake", 85)];
  await render(<Home />);
  await screen.findByText("wake on");
  const row = screen.getByTestId("home-columns");
  // Every mocked View shares these methods.
  const native = jest.requireActual(
    "@react-native/jest-preset/jest/MockNativeMethods",
  ).default;
  native.measureInWindow.mockImplementation((cb: any) => cb(96, 80, 760, 400));
  try {
    await fireEvent(row, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 760, height: 400 } },
    });
  } finally {
    native.measureInWindow.mockReset();
  }
  // A phone too small for two flat columns still gets one per half.
  expect(texts()).toEqual(["sessions", "wake on", "snippets on"]);
  expect(screen.getByTestId("home-column-0")).toHaveStyle({ width: 332 });
  expect(screen.getByTestId("home-column-1")).toHaveStyle({ flex: 1 });
  expect(row).toHaveStyle({ gap: 24 });
});

test("edit mode reorders and hides, and the layout is saved", async () => {
  mockFeatureCards = [card("snippets", 70), card("wake", 85)];
  await render(<Home />);
  await screen.findByText("wake on");
  await fireEvent.press(screen.getByLabelText("Edit Home"));

  await fireEvent.press(screen.getByLabelText("Show snippets card"));
  await act(async () => {
    mockDragEnd!({
      data: [
        { key: "wake", hidden: false },
        { key: "sessions", hidden: false },
        { key: "snippets", hidden: true },
      ],
    });
  });
  await fireEvent.press(screen.getByText("Done"));

  expect(texts()).toEqual(["wake on", "sessions"]);
  const saved = JSON.parse((await AsyncStorage.getItem("home.layout.a1"))!);
  expect(saved.slots.map((s: any) => s.key)).toEqual([
    "wake",
    "sessions",
    "snippets",
  ]);
});

test("reset asks first, then brings back the default", async () => {
  mockFeatureCards = [card("snippets", 70)];
  await AsyncStorage.setItem(
    "home.layout.a1",
    JSON.stringify({
      version: 1,
      slots: [{ key: "snippets", hidden: true }],
    }),
  );
  await render(<Home />);
  await screen.findByText("sessions");
  expect(texts()).toEqual(["sessions"]);

  await fireEvent.press(screen.getByLabelText("Edit Home"));
  await fireEvent.press(screen.getByText("Reset to default"));
  expect(mockConfirm).toHaveBeenCalled();
  await screen.findByText("snippets on");
  expect(await AsyncStorage.getItem("home.layout.a1")).toBeNull();
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
