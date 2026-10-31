import { fireEvent, render, screen } from "@testing-library/react-native";
import { accounts } from "@/core/accounts";
import { localStores } from "@/core/db/stores";
import { SyncBanner } from "@/screens/hosts/SyncBanner";
import SyncSettings from "@/screens/settings/Sync";
import { ConfirmProvider } from "@/ui";
import { resetStorage } from "../../helpers/http";
import { testDriver } from "../../helpers/db";

const mockOpenAuthFlow = jest.fn();

jest.mock("@/contexts/AppContext", () => ({
  useAppContext: () => ({ openAuthFlow: mockOpenAuthFlow }),
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => "/",
}));

beforeEach(async () => {
  await resetStorage();
  mockOpenAuthFlow.mockClear();
  localStores.setDriver(testDriver());
  localStores.unlock();
});

afterEach(async () => {
  await accounts.setActive("local");
  for (const a of accounts.list()) {
    if (a.kind === "server") await accounts.remove(a.id);
  }
});

async function linkedAccount(patch: Record<string, unknown> = {}) {
  const account = await accounts.add("https://termix.example");
  await accounts.update(account.id, {
    serverName: "Home",
    options: { sync: true },
    ...patch,
  });
  await accounts.setActive(account.id);
  return account;
}

test("the banner says the session ended and offers to sign in again", async () => {
  await linkedAccount({ status: "signed_out", lastError: "expired" });
  await render(<SyncBanner />);
  expect(screen.getByText("Signed out")).toBeTruthy();
  await fireEvent.press(screen.getByText("Sign in again"));
  expect(mockOpenAuthFlow).toHaveBeenCalledWith("login");
});

test("the banner stays away when sync is fine or only offline", async () => {
  await linkedAccount({ status: "offline", lastError: "offline" });
  await render(<SyncBanner />);
  expect(screen.queryByText("Offline")).toBeNull();
});

test("the sync screen lists what syncs and offers unlink with keep", async () => {
  await linkedAccount({ lastSyncAt: new Date().toISOString() });
  await render(
    <ConfirmProvider>
      <SyncSettings />
    </ConfirmProvider>,
  );
  expect(screen.getByText("What syncs")).toBeTruthy();
  expect(screen.getByText("Hosts and folders")).toBeTruthy();
  expect(screen.getByText("Snippets")).toBeTruthy();
  expect(screen.getByText("Headers")).toBeTruthy();
  await fireEvent.press(screen.getByText("Unlink this server"));
  expect(await screen.findByText("Keep a copy on This device")).toBeTruthy();
});

test("a server that can't sync says how to turn it on", async () => {
  await linkedAccount({ options: { sync: false } });
  await render(
    <ConfirmProvider>
      <SyncSettings />
    </ConfirmProvider>,
  );
  expect(
    screen.getByText("This server reads live and keeps no copy on the phone."),
  ).toBeTruthy();
  expect(screen.queryByText("What syncs")).toBeNull();
});
