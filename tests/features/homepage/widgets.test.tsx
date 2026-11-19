import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { HomepageCard } from "@/features/homepage/HomepageCard";
import {
  CustomApiWidget,
  resolvePath,
  RssFeedWidget,
  WeatherWidget,
} from "@/features/homepage/widgets/feeds";
import {
  BookmarkListWidget,
  LinkTreeWidget,
  SearchBarWidget,
  ServiceGridWidget,
  ServiceLinksWidget,
} from "@/features/homepage/widgets/links";
import { safeUrl } from "@/features/homepage/widgets/shared";
import {
  HostGridWidget,
  PingStatusWidget,
  hostsFor,
} from "@/features/homepage/widgets/status";
import {
  NotesWidget,
  plainMarkdown,
  TextBannerWidget,
} from "@/features/homepage/widgets/text";
import { monthGrid, remaining } from "@/features/homepage/widgets/time";
import { HomeDataContext } from "@/screens/home/HomeData";

const mockPush = jest.fn();
let mockItems: any[] = [];
const mockGet = jest.fn();
const mockClient: any = {
  accountId: "s1",
  http: { auth: { get: (...a: any[]) => mockGet(...a) } },
};

jest.mock("expo-router", () => ({
  router: { push: (...a: any[]) => mockPush(...a) },
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888",
}));
jest.mock("@/core/exec", () => ({
  usePoll: (task: (s: AbortSignal) => void, o: { enabled?: boolean }) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      if (o.enabled !== false) void task(new AbortController().signal);
    }, [task, o.enabled]);
  },
}));
jest.mock("@/core/accounts", () => ({ useClient: () => mockClient }));
jest.mock("@/features/homepage/api", () => ({
  ...jest.requireActual("@/features/homepage/api"),
  cachedItems: async () => mockItems,
}));

const item = (typeId: string, config: object, title: string | null = null) =>
  ({ id: 1, typeId, title, config }) as any;
const base = { client: mockClient, active: true, refreshKey: 0 };

// The two grids on a real Homepage, with example addresses.
const media = item(
  "service_grid",
  {
    services: [
      {
        label: "Jellyfin",
        url: "https://jellyfin.example.com",
        imageUrl: "https://cdn.example.com/jellyfin.png",
      },
      { label: "Seerr", url: "https://seerr.example.com" },
    ],
    columns: 4,
    showLabels: true,
    iconSize: "md",
  },
  "Media",
);

let openSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockItems = [];
  openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  mockGet.mockImplementation(async (url: string, opts?: any) => {
    if (url.endsWith("/ping")) {
      return {
        data: {
          ok: !opts.params.url.includes("seerr"),
          statusCode: 200,
          latencyMs: 42,
        },
      };
    }
    if (url.endsWith("/service-links")) {
      return {
        data: [
          { id: 1, label: "Proxmox", url: "https://pve.example", order: 0 },
        ],
      };
    }
    if (url.endsWith("/rss")) {
      return {
        data: [
          {
            title: "Release 2.0",
            link: "https://blog.example/2",
            pubDate: null,
            description: null,
          },
        ],
      };
    }
    if (url.endsWith("/proxy")) return { data: { stats: { users: 12 } } };
    throw new Error(url);
  });
});

test("only web links open", () => {
  expect(safeUrl("jellyfin.example.com")).toBe("http://jellyfin.example.com");
  expect(safeUrl("https://a.example")).toBe("https://a.example");
  expect(safeUrl("javascript:alert(1)")).toBeNull();
  expect(safeUrl("  ")).toBeNull();
});

test("a service grid shows each service, pings it, and opens it", async () => {
  await render(<ServiceGridWidget item={media} {...base} />);
  expect(screen.getByText("Jellyfin")).toBeTruthy();
  expect(screen.getByText("Seerr")).toBeTruthy();
  expect(mockGet).toHaveBeenCalledWith("/plugin-api/homepage/ping", {
    params: { url: "https://jellyfin.example.com" },
  });
  await fireEvent.press(screen.getByLabelText("Jellyfin"));
  expect(openSpy).toHaveBeenCalledWith("https://jellyfin.example.com");
});

test("the plugin's service links show as tiles", async () => {
  await render(
    <ServiceLinksWidget item={item("service_links", {})} {...base} />,
  );
  expect(await screen.findByText("Proxmox")).toBeTruthy();
});

test("bookmarks and link trees list their links", async () => {
  await render(
    <BookmarkListWidget
      item={item("bookmark_list", {
        links: [{ label: "Docs", url: "https://docs.example" }, { label: "x" }],
      })}
      {...base}
    />,
  );
  await fireEvent.press(screen.getByText("Docs"));
  expect(openSpy).toHaveBeenCalledWith("https://docs.example");

  await render(
    <LinkTreeWidget
      item={item("link_tree", {
        sections: [
          {
            heading: "Infra",
            links: [{ label: "Git", url: "https://git.example" }],
          },
        ],
      })}
      {...base}
    />,
  );
  expect(screen.getByText("Infra")).toBeTruthy();
  expect(screen.getByText("Git")).toBeTruthy();
});

test("a search bar opens the engine with the query", async () => {
  await render(
    <SearchBarWidget
      item={item("search_bar", { engine: "duckduckgo" })}
      {...base}
    />,
  );
  const input = screen.getByPlaceholderText("Search");
  await fireEvent.changeText(input, "termix ssh");
  await fireEvent(input, "submitEditing");
  expect(openSpy).toHaveBeenCalledWith(
    "https://duckduckgo.com/?q=termix%20ssh",
  );
});

test("notes read as plain text and banners show their text", async () => {
  expect(
    plainMarkdown("# Title\n- **bold** [link](https://x)\n- [x] done"),
  ).toBe("Title\n- bold link\n[x] done");
  await render(
    <NotesWidget
      item={item("markdown_notes", { content: "## Hi *there*" })}
      {...base}
    />,
  );
  expect(screen.getByText("Hi there")).toBeTruthy();
  await render(
    <TextBannerWidget item={item("text_banner", { text: "Lab" })} {...base} />,
  );
  expect(screen.getByText("Lab")).toBeTruthy();
});

test("countdowns never go below zero and months line up", () => {
  expect(remaining(1000, 2000).done).toBe(true);
  expect(remaining(90_061_000, 0)).toMatchObject({
    days: 1,
    hours: 1,
    minutes: 1,
    seconds: 1,
  });
  // November 2026 starts on a Sunday.
  expect(monthGrid(2026, 10, false)).toEqual({ offset: 0, days: 30 });
  expect(monthGrid(2026, 10, true)).toEqual({ offset: 6, days: 30 });
});

test("ping status shows latency or down", async () => {
  await render(
    <PingStatusWidget
      item={item("ping_status", {
        urls: [
          { label: "Jellyfin", url: "https://jellyfin.example.com" },
          { label: "Seerr", url: "https://seerr.example.com" },
        ],
        showLatency: true,
      })}
      {...base}
    />,
  );
  expect(await screen.findByText("42 ms")).toBeTruthy();
  expect(screen.getByText("Down")).toBeTruthy();
});

test("host widgets find app hosts by their server id", async () => {
  const hosts = [
    { id: 1, serverId: 10, name: "web", ip: "10.0.0.1" },
    { id: 2, name: "db", ip: "10.0.0.2" },
  ] as any[];
  expect(hostsFor([2, 10, 99, "x"], hosts).map((h) => h.name)).toEqual([
    "db",
    "web",
  ]);
  const openHost = jest.fn();
  await render(
    <HomeDataContext.Provider
      value={{
        hosts,
        hostsLoading: false,
        statuses: { 1: "online" },
        openHost,
        showHostMenu: jest.fn(),
      }}
    >
      <HostGridWidget item={item("host_grid", { hostIds: [10] })} {...base} />
    </HomeDataContext.Provider>,
  );
  await fireEvent.press(screen.getByLabelText("web"));
  expect(openHost).toHaveBeenCalledWith(hosts[0]);
});

test("feeds and custom APIs go through the plugin", async () => {
  await render(
    <RssFeedWidget
      item={item("rss_feed", { feedUrl: "https://blog.example/rss" })}
      {...base}
    />,
  );
  expect(await screen.findByText("Release 2.0")).toBeTruthy();

  expect(resolvePath({ a: { b: [5] } }, "a.b.0")).toBe(5);
  await render(
    <CustomApiWidget
      item={item("custom_api", {
        url: "https://api.example",
        displayMode: "value",
        displayField: "stats.users",
        unit: "users",
      })}
      {...base}
    />,
  );
  expect(await screen.findByText("12 users")).toBeTruthy();
});

test("weather reads wttr.in", async () => {
  const fetchSpy = jest.spyOn(global, "fetch" as any).mockResolvedValue({
    ok: true,
    json: async () => ({
      nearest_area: [{ areaName: [{ value: "Austin" }] }],
      current_condition: [
        {
          temp_C: "20",
          temp_F: "68",
          FeelsLikeC: "19",
          FeelsLikeF: "66",
          weatherDesc: [{ value: "Sunny" }],
        },
      ],
      weather: [],
    }),
  } as any);
  await render(
    <WeatherWidget
      item={item("weather", { location: "Austin", unit: "F" })}
      {...base}
    />,
  );
  expect(await screen.findByText("68°F")).toBeTruthy();
  expect(screen.getByText("Sunny")).toBeTruthy();
  fetchSpy.mockRestore();
});

test("a widget the app can't draw offers the full page", async () => {
  mockItems = [{ id: 9, typeId: "iframe_embed", title: "Grafana", config: {} }];
  await render(
    <HomepageCard accountId="s1" active refreshKey={0} instance="9" />,
  );
  expect(await screen.findByText("Grafana")).toBeTruthy();
  await fireEvent.press(screen.getByText("Open in Homepage"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/tabs/plugins/[pluginId]",
    params: { pluginId: "homepage", view: "homepage", account: "s1" },
  });
});

test("a widget removed on the server leaves no card", async () => {
  mockItems = [];
  await render(
    <HomepageCard accountId="s1" active refreshKey={0} instance="9" />,
  );
  expect(screen.queryByText("Open in Homepage")).toBeNull();
});
