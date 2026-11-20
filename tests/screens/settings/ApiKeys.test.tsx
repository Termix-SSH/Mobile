import { fireEvent, render, screen } from "@testing-library/react-native";
import ApiKeys from "@/screens/settings/ApiKeys";
import { ConfirmProvider } from "@/ui/Confirm";

const mockApi = {
  apiKeys: {
    getApiKeys: jest.fn(async () => ({ apiKeys: [] })),
    createApiKey: jest.fn(),
  },
  users: {
    getUserList: jest.fn(async () => ({
      users: [{ userId: "u1", username: "admin" }],
    })),
  },
};
const mockClient = {};
jest.mock("@/core/accounts", () => ({
  useActiveClient: () => mockClient,
  apiOf: () => mockApi,
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
  useUiColors: () => ({}),
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("@/utils/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

test("a new key's token is shown once in the same sheet", async () => {
  mockApi.apiKeys.createApiKey.mockResolvedValue({
    id: "k1",
    name: "CI",
    token: "tmx_secret_token",
  });
  await render(
    <ConfirmProvider>
      <ApiKeys />
    </ConfirmProvider>,
  );
  await fireEvent.press(screen.getByLabelText("New API key"));
  await fireEvent.changeText(
    screen.getByPlaceholderText("e.g. CI Pipeline"),
    "CI",
  );
  await fireEvent.press(screen.getByText("Create"));
  expect(mockApi.apiKeys.createApiKey).toHaveBeenCalledWith(
    "CI",
    "u1",
    undefined,
  );
  expect(await screen.findByText("tmx_secret_token")).toBeTruthy();
  expect(screen.getByText("Key created. Copy it now")).toBeTruthy();
  expect(
    screen.container.queryAll(
      (node) => node.type === "Modal" && node.props.visible,
    ),
  ).toHaveLength(1);
  await fireEvent.press(screen.getByText("Done"));
  expect(screen.queryByText("tmx_secret_token")).toBeNull();
});
