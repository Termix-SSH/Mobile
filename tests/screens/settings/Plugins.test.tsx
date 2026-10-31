import { fireEvent, render, screen } from "@testing-library/react-native";
import { accounts } from "@/core/accounts";
import { registerBuiltInFeatures } from "@/features";
import Plugins from "@/screens/settings/Plugins";
import { fakeServer, resetStorage } from "../../helpers/http";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  usePathname: () => "/",
}));

beforeAll(() => registerBuiltInFeatures());

beforeEach(resetStorage);

afterEach(async () => {
  await accounts.setActive("local");
  for (const a of accounts.list()) {
    if (a.kind === "server") await accounts.remove(a.id);
  }
});

const PLUGINS = [
  {
    id: "ssh-terminal",
    name: "SSH Terminal",
    version: "1.1.0",
    enabled: true,
    state: "active",
    engine: { api: "^1.11" },
  },
  { id: "docker", name: "Docker", enabled: false, state: "disabled" },
  {
    id: "alerts",
    name: "Alerts",
    version: "2.0.0",
    enabled: true,
    state: "active",
    engine: { api: "^1.99" },
  },
  {
    id: "kubernetes",
    name: "Kubernetes",
    enabled: true,
    state: "failed",
  },
];

async function linkServer() {
  fakeServer((req) => {
    if (req.url.endsWith("/plugins/public-manifest")) return { data: {} };
    if (req.url.endsWith("/plugins")) return { data: PLUGINS };
    return { data: {} };
  });
  const account = await accounts.add("https://termix.example");
  await accounts.update(account.id, { serverName: "Home" });
  await accounts.client(account.id)!.refreshServerApi();
  await accounts.setActive(account.id);
  return account;
}

test("This device lists what works with no server", async () => {
  await render(<Plugins />);
  expect(screen.getByText("Plugins")).toBeTruthy();
  expect(screen.queryByText("On this server")).toBeNull();
  expect(screen.getByText(/Works on this phone \(\d+\)/)).toBeTruthy();
  expect(screen.getByText("File Manager")).toBeTruthy();
  expect(screen.getAllByText("Link a server to use it").length).toBeGreaterThan(
    0,
  );
});

test("a linked server lists its plugins with state, how they show and API checks", async () => {
  await linkServer();
  await render(<Plugins />);

  expect(screen.getByText("On this server")).toBeTruthy();
  expect(screen.getByText("SSH Terminal")).toBeTruthy();
  expect(screen.getByText("1.1.0")).toBeTruthy();
  expect(screen.getByText("On | In the app")).toBeTruthy();
  expect(screen.getByText("Off | In the app")).toBeTruthy();
  expect(
    screen.getByText("On | Web view | Needs a newer version of the app"),
  ).toBeTruthy();
  expect(screen.getByText("Not running | Web view")).toBeTruthy();
  // Official plugins the server does not have stay in Everything.
  expect(screen.queryByText("Proxmox")).toBeNull();

  await fireEvent.press(screen.getByText("Alerts"));
  expect(screen.getByText("Update the app")).toBeTruthy();
  expect(screen.getByText("^1.99")).toBeTruthy();
  expect(screen.getByText("1.13.0")).toBeTruthy();
  expect(screen.queryByText("Open")).toBeNull();
});

test("Everything shows the phone and server sections, and tabs switch accounts", async () => {
  await linkServer();
  await render(<Plugins />);

  await fireEvent.press(screen.getByText("Everything"));
  expect(screen.getByText("Phone only | off on this server")).toBeTruthy();
  expect(screen.getAllByText("Not on this server").length).toBeGreaterThan(0);

  await fireEvent.press(screen.getByText("This device"));
  expect(screen.queryByText("Phone only | off on this server")).toBeNull();
  expect(screen.getByText(/This device works with no server/)).toBeTruthy();
});
