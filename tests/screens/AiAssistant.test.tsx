import { act, fireEvent, render } from "@testing-library/react-native";
import { Linking } from "react-native";
import { useFeatureContext } from "@/core/features/hooks";
import type { FeatureContext } from "@/core/features/types";
import type { AiAccess } from "@/features/ai/access";
import { initialRun } from "@/features/ai/run";
import type { AiConversation, AiProvider } from "@/features/ai/types";
import { useAiChat } from "@/features/ai/useAiChat";
import AiAssistant from "@/screens/settings/AiAssistant";
import type { ConfirmOptions } from "@/ui/Confirm";

jest.mock("@/features/ai/useAiChat", () => ({ useAiChat: jest.fn() }));
jest.mock("@/core/features/hooks", () => ({ useFeatureContext: jest.fn() }));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#999999",
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);
jest.mock("@/ui/Toast", () => ({ Toaster: () => null }));
jest.mock("@/utils/toast", () => ({ toast: { error: jest.fn() } }));

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));
const mockConfirm = jest.fn<Promise<boolean>, [ConfirmOptions]>();
jest.mock("@/ui/Confirm", () => ({ useConfirm: () => mockConfirm }));
const mockOpenURL = jest.spyOn(Linking, "openURL");
const mockGetHosts = jest.fn(async () => [{ id: 7, name: "Production" }]);

const context = {
  account: { id: "server-a", kind: "server", serverUrl: "https://termix.test" },
  client: { api: { hosts: { getSSHHosts: mockGetHosts } } },
} as unknown as FeatureContext;

const provider: AiProvider = {
  id: 2,
  providerType: "ollama",
  label: "Local AI",
  baseUrl: null,
  apiKeyPrefix: null,
  defaultModel: "model-a",
  modelOverrides: { "model-a": {}, "model-b": {} },
  advanced: {},
  enabled: true,
  createdAt: "",
};
const conversation: AiConversation = {
  id: 8,
  title: "Server health",
  providerId: 2,
  model: "model-a",
  createdAt: "2025-03-03T12:00:00.000Z",
  updatedAt: "2025-03-04T12:00:00.000Z",
};

function makeChat(): ReturnType<typeof useAiChat> {
  return {
    access: { state: "ready", allowReadOnlyCommands: true },
    providers: [provider],
    selectedProviderId: 2,
    selectedModel: "model-a",
    conversations: [conversation],
    conversationId: null,
    messages: [],
    run: null,
    proposals: [],
    lockedProposals: [],
    lastUserMessage: null,
    error: null,
    refreshAccess: jest.fn(async () => {}),
    optIn: jest.fn(async () => {}),
    setSelectedProviderId: jest.fn(),
    setSelectedModel: jest.fn(),
    refreshConversations: jest.fn(async () => {}),
    openConversation: jest.fn(async () => {}),
    newConversation: jest.fn(),
    deleteConversation: jest.fn(async () => {}),
    send: jest.fn(async () => true),
    cancel: jest.fn(),
    canResend: false,
    resend: jest.fn(async () => {}),
    applyProposal: jest.fn(async () => {}),
    rejectProposal: jest.fn(async () => {}),
  };
}

let chat: ReturnType<typeof useAiChat>;
beforeEach(() => {
  chat = makeChat();
  jest.mocked(useAiChat).mockReturnValue(chat);
  jest.mocked(useFeatureContext).mockReturnValue(context);
  mockGetHosts.mockReset().mockResolvedValue([{ id: 7, name: "Production" }]);
  mockConfirm.mockReset().mockResolvedValue(false);
  mockOpenURL.mockReset().mockResolvedValue(undefined);
  mockBack.mockClear();
});

test("loading shows a spinner", async () => {
  chat.access = "loading";
  const result = await render(<AiAssistant />);
  expect(result.getByLabelText("Loading AI assistant")).toBeTruthy();
  expect(result.queryByText("New chat")).toBeNull();
});

test.each<[AiAccess, string]>([
  [{ state: "not-installed" }, "The AI plugin is not installed on this server"],
  [
    { state: "disabled-globally" },
    "An administrator has to enable the AI assistant in the web admin settings",
  ],
  [
    { state: "needs-opt-in", allowReadOnlyCommands: true },
    "Enable the AI assistant for your account",
  ],
  [
    { state: "signed-out" },
    "Your session expired. Sign in again from Settings.",
  ],
  [
    { state: "forbidden" },
    "You do not have permission to use the AI assistant",
  ],
  [{ state: "error", message: "Server unavailable" }, "Server unavailable"],
])("access %s renders its explanation", async (access, text) => {
  chat.access = access;
  const result = await render(<AiAssistant />);
  expect(result.getByText(text)).toBeTruthy();
  expect(result.queryByText("New chat")).toBeNull();
});

test("opting in enables the assistant", async () => {
  chat.access = { state: "needs-opt-in", allowReadOnlyCommands: true };
  const result = await render(<AiAssistant />);
  await fireEvent.press(
    result.getByRole("button", { name: "Enable AI assistant" }),
  );
  expect(chat.optIn).toHaveBeenCalledTimes(1);
});

test("tab mode lists conversations without a Back button and returns from chat", async () => {
  const result = await render(<AiAssistant mode="tab" />);
  expect(result.getByText("AI Assistant")).toBeTruthy();
  expect(result.getByText("Server health")).toBeTruthy();
  expect(result.queryByRole("button", { name: "Back" })).toBeNull();
  await fireEvent.press(result.getByText("Server health"));
  await fireEvent.press(
    result.getByRole("button", { name: "Back to conversations" }),
  );
  expect(result.getByText("Server health")).toBeTruthy();
  expect(result.queryByRole("button", { name: "Back" })).toBeNull();
  expect(mockBack).not.toHaveBeenCalled();
});

test("tab mode preserves the opt-in AccessState without a Back button", async () => {
  chat.access = { state: "needs-opt-in", allowReadOnlyCommands: true };
  const result = await render(<AiAssistant mode="tab" />);
  expect(
    result.getByText("Enable the AI assistant for your account"),
  ).toBeTruthy();
  expect(result.queryByRole("button", { name: "Back" })).toBeNull();
  await fireEvent.press(
    result.getByRole("button", { name: "Enable AI assistant" }),
  );
  expect(chat.optIn).toHaveBeenCalledTimes(1);
});

test("a recently updated conversation shows a relative time", async () => {
  chat.conversations = [
    {
      ...conversation,
      updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    },
  ];
  const result = await render(<AiAssistant />);
  expect(result.getByText("5m ago")).toBeTruthy();
});

test("an access error can be retried", async () => {
  chat.access = { state: "error", message: "Try later" };
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByRole("button", { name: "Retry" }));
  expect(chat.refreshAccess).toHaveBeenCalledTimes(1);
});

test("ready lists conversations and opens the selected chat", async () => {
  chat.conversations.push({ ...conversation, id: 9, title: null });
  const result = await render(<AiAssistant />);
  expect(result.getByText("Server health")).toBeTruthy();
  expect(result.getByText("New conversation")).toBeTruthy();
  const shownDate = new Date(conversation.updatedAt).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );
  expect(result.getAllByText(shownDate)).toHaveLength(2);
  expect(result.queryByText(conversation.updatedAt)).toBeNull();
  await fireEvent.press(result.getByText("Server health"));
  expect(chat.openConversation).toHaveBeenCalledWith(8);
  expect(result.getByLabelText("Message")).toBeTruthy();
  await fireEvent.press(
    result.getByRole("button", { name: "Back to conversations" }),
  );
  expect(result.getByText("Server health")).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
});

test("New chat resets the conversation and Send passes text and clears the input", async () => {
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByRole("button", { name: "New chat" }));
  expect(chat.newConversation).toHaveBeenCalledTimes(1);
  await fireEvent.changeText(
    result.getByLabelText("Message"),
    "  Check server health  ",
  );
  await fireEvent.press(result.getByRole("button", { name: "Send" }));
  expect(chat.send).toHaveBeenCalledWith("  Check server health  ");
  expect(result.getByLabelText("Message").props.value).toBe("");
  await fireEvent.press(result.getByRole("button", { name: "Send" }));
  expect(chat.send).toHaveBeenCalledTimes(1);
});

test("ChatView keeps the input when send declines the message", async () => {
  jest.mocked(chat.send).mockResolvedValue(false);
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByRole("button", { name: "New chat" }));
  await fireEvent.changeText(
    result.getByLabelText("Message"),
    "Keep this draft",
  );
  await fireEvent.press(result.getByRole("button", { name: "Send" }));
  expect(chat.send).toHaveBeenCalledWith("Keep this draft");
  expect(result.getByLabelText("Message").props.value).toBe("Keep this draft");
});

test("streaming replaces Send with Stop and calls cancel", async () => {
  chat.run = initialRun();
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByRole("button", { name: "New chat" }));
  expect(result.queryByRole("button", { name: "Send" })).toBeNull();
  await fireEvent.press(result.getByRole("button", { name: "Stop" }));
  expect(chat.cancel).toHaveBeenCalledTimes(1);
});

test("deletion waits for confirmation", async () => {
  let settle!: (confirmed: boolean) => void;
  mockConfirm.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      settle = resolve;
    }),
  );
  const result = await render(<AiAssistant />);
  await fireEvent.press(
    result.getByRole("button", { name: "Delete Server health" }),
    {
      stopPropagation: jest.fn(),
    },
  );
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ destructive: true }),
  );
  expect(chat.deleteConversation).not.toHaveBeenCalled();
  expect(chat.openConversation).not.toHaveBeenCalled();
  await act(async () => settle(true));
  expect(chat.deleteConversation).toHaveBeenCalledWith(8);
});

test("pull to refresh reloads conversations", async () => {
  const result = await render(<AiAssistant />);
  await fireEvent(result.getByLabelText("Conversations"), "refresh");
  expect(chat.refreshConversations).toHaveBeenCalledTimes(1);
});

test("Open on web uses the account URL only after confirmation", async () => {
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByRole("link", { name: "Open on web" }));
  expect(mockOpenURL).not.toHaveBeenCalled();
  mockConfirm.mockResolvedValueOnce(true);
  await fireEvent.press(result.getByRole("link", { name: "Open on web" }));
  expect(mockOpenURL).toHaveBeenCalledWith("https://termix.test");
  expect(mockConfirm).toHaveBeenLastCalledWith(
    expect.objectContaining({ destructive: false }),
  );
});

test("the model picker lists only enabled providers and configured models", async () => {
  chat.providers.push({
    ...provider,
    id: 3,
    label: "Disabled AI",
    enabled: false,
  });
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByText("New chat"));
  await fireEvent.press(
    result.getByRole("button", { name: "Choose provider and model" }),
  );
  expect(result.queryByText("Disabled AI")).toBeNull();
  await fireEvent.press(result.getByRole("button", { name: "Local AI" }));
  expect(chat.setSelectedProviderId).toHaveBeenCalledWith(2);
  await fireEvent.press(result.getByRole("button", { name: "model-b" }));
  expect(chat.setSelectedModel).toHaveBeenCalledWith("model-b");
});

test("the model picker falls back to free text without a configured list", async () => {
  chat.providers = [{ ...provider, modelOverrides: {} }];
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByText("New chat"));
  await fireEvent.press(
    result.getByRole("button", { name: "Choose provider and model" }),
  );
  await fireEvent.changeText(
    result.getByLabelText("Model name"),
    "custom-model",
  );
  expect(chat.setSelectedModel).toHaveBeenCalledWith("custom-model");
});

test("chat renders history, run, proposals with host names, and errors", async () => {
  chat.messages = [
    {
      id: 1,
      conversationId: 8,
      role: "user",
      content: "Inspect this host",
      toolCalls: null,
      createdAt: "",
    },
  ];
  chat.run = {
    ...initialRun(),
    text: "The server is healthy",
    finished: true,
    finishReason: "cancelled",
  };
  chat.canResend = true;
  chat.proposals = [
    {
      id: 10,
      conversationId: 8,
      kind: "run_command",
      summary: "Check uptime",
      payload: JSON.stringify({ hostId: 7, command: "uptime" }),
      status: "pending",
      resultSummary: null,
      createdAt: "",
    },
  ];
  chat.error = "A request failed";
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByText("Server health"));
  expect(result.getByText("Inspect this host")).toBeTruthy();
  expect(result.getByText("The server is healthy")).toBeTruthy();
  expect(result.getByText("Hosts: Production")).toBeTruthy();
  expect(result.getByRole("alert")).toHaveTextContent("A request failed");
  await fireEvent.press(result.getByRole("button", { name: "Send again" }));
  expect(chat.resend).toHaveBeenCalledTimes(1);
  expect(mockGetHosts).toHaveBeenCalledTimes(1);
});

test("host lookup failures do not prevent chatting", async () => {
  mockGetHosts.mockRejectedValueOnce(new Error("Unavailable"));
  const result = await render(<AiAssistant />);
  await fireEvent.press(result.getByText("New chat"));
  expect(result.getByLabelText("Message")).toBeTruthy();
});
