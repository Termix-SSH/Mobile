import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { CertPinSettings } from "@/screens/accounts/CertPinSettings";
import { ConfirmProvider } from "@/ui";
import { resetStorage } from "../../helpers/http";
import { clearFakeNet, fakeNet } from "../../helpers/net";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888888",
  useUiColors: () =>
    new Proxy({}, { get: () => "#888888" }) as Record<string, string>,
  useTheme: () => ({ isDark: true }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/utils/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

beforeEach(resetStorage);
afterEach(clearFakeNet);

function setup() {
  const net = fakeNet();
  const client = new AccountClient({
    accountId: "a1",
    serverUrl: "https://t.example/",
    storage: accountStorage("a1"),
  });
  return { net, client };
}

async function show(client: AccountClient) {
  await render(
    <ConfirmProvider>
      <CertPinSettings client={client} />
    </ConfirmProvider>,
  );
}

test("reading the server's key asks before pinning it", async () => {
  const { net, client } = setup();
  await show(client);
  await fireEvent.press(screen.getByText("Read the key from the server"));
  await waitFor(() => expect(screen.getByText("Pin this key?")).toBeTruthy());
  await fireEvent.press(screen.getByText("Pin this key"));
  await waitFor(() => expect(client.certPins()).toEqual([net.serverKey]));
  expect(net.pins.get("t.example")).toEqual([net.serverKey]);
});

test("a pasted pin is checked, saved and can be removed", async () => {
  const { net, client } = setup();
  await show(client);
  const input = screen.getByLabelText("Pin");
  await fireEvent.changeText(input, "not a pin");
  await fireEvent.press(screen.getByText("Add"));
  expect(client.certPins()).toEqual([]);
  const pin = "Q".repeat(43) + "=";
  await fireEvent.changeText(input, `sha256/${pin}`);
  await fireEvent.press(screen.getByText("Add"));
  await waitFor(() => expect(client.certPins()).toEqual([pin]));
  await fireEvent.press(screen.getByLabelText(/Remove pin/));
  await waitFor(() => expect(client.certPins()).toEqual([]));
  expect(net.pins.size).toBe(0);
});
