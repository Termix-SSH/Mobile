import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { AiApiError, type AiApi } from "@/core/api/modules/ai";
import { useFeatureContext } from "@/core/features/hooks";
import type { FeatureContext } from "@/core/features/types";
import { applyEvent, finishRun, initialRun } from "@/features/ai/run";
import {
  buildHistory,
  mergeProposals,
  useAiChat,
} from "@/features/ai/useAiChat";
import type { AiAccess } from "@/features/ai/access";
import type {
  AiConversation,
  AiMessage,
  AiProposal,
  AiProvider,
} from "@/features/ai/types";

jest.mock("@/core/features/hooks", () => ({ useFeatureContext: jest.fn() }));

const ready: AiAccess = { state: "ready", allowReadOnlyCommands: true };
const provider: AiProvider = {
  id: 2,
  providerType: "ollama",
  label: "Local",
  baseUrl: null,
  apiKeyPrefix: null,
  defaultModel: "model-a",
  modelOverrides: {},
  advanced: {},
  enabled: true,
  createdAt: "",
};
const conversation: AiConversation = {
  id: 8,
  title: "Chat",
  providerId: 2,
  model: "model-a",
  createdAt: "",
  updatedAt: "",
};
const proposal: AiProposal = {
  id: 10,
  conversationId: 8,
  kind: "run_command",
  payload: '{"command":"uptime"}',
  summary: "Read uptime",
  status: "pending",
  resultSummary: null,
  createdAt: "",
};
const message = (
  id: number,
  role: AiMessage["role"],
  content = role,
): AiMessage => ({
  id,
  role,
  content,
  conversationId: 8,
  toolCalls: null,
  createdAt: "",
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeApi(): jest.Mocked<AiApi> {
  const api = {
    isAiAvailable: jest.fn(() => true),
    getAccess: jest.fn(async () => ready),
    optIn: jest.fn(async () => ready),
    listProviders: jest.fn(async () => [
      { ...provider, id: 1, enabled: false },
      provider,
    ]),
    listConversations: jest.fn(async () => [conversation]),
    getConversation: jest.fn(async () => ({
      conversation,
      messages: [
        message(1, "user"),
        message(2, "tool"),
        message(3, "assistant"),
        message(4, "summary"),
      ],
      proposals: [proposal],
    })),
    deleteConversation: jest.fn(async () => {}),
    applyProposal: jest.fn(async () => ({ success: true, summary: "Applied" })),
    rejectProposal: jest.fn(async () => {}),
    streamChat: jest.fn(async () => {}),
  };
  // The bare mocks ignore their arguments; tests set typed results as needed.
  return api as unknown as jest.Mocked<AiApi>;
}

let api: jest.Mocked<AiApi>;
let context: FeatureContext;
let appState: (state: AppStateStatus) => void;
let removeListener: jest.Mock;

beforeEach(() => {
  api = makeApi();
  context = {
    account: { id: "account-a", kind: "server" },
    client: { api: { ai: api } },
  } as unknown as FeatureContext;
  jest.mocked(useFeatureContext).mockReturnValue(context);
  removeListener = jest.fn();
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event, listener) => {
      appState = listener;
      return { remove: removeListener };
    });
});

afterEach(() => jest.restoreAllMocks());

async function mountReady() {
  const hook = await renderHook(() => useAiChat());
  await waitFor(() => expect(hook.result.current.selectedProviderId).toBe(2));
  return hook;
}

function pendingStream() {
  const pending = deferred<void>();
  let emit!: Parameters<AiApi["streamChat"]>[1];
  let signal!: AbortSignal;
  api.streamChat.mockImplementation((_input, onEvent, abortSignal) => {
    emit = onEvent;
    signal = abortSignal;
    signal.addEventListener("abort", () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      pending.reject(error);
    });
    return pending.promise;
  });
  return {
    ...pending,
    emit: (event: unknown) => emit(event),
    signal: () => signal,
  };
}

test("access loads before providers and conversations, selecting the first enabled provider", async () => {
  const access = deferred<AiAccess>();
  api.getAccess.mockReturnValue(access.promise);
  const { result } = await renderHook(() => useAiChat());
  expect(result.current.access).toBe("loading");
  expect(api.listProviders).not.toHaveBeenCalled();
  await act(async () => access.resolve(ready));
  await waitFor(() => expect(result.current.selectedProviderId).toBe(2));
  expect(result.current.access).toEqual(ready);
  expect(result.current.selectedModel).toBe("model-a");
  expect(result.current.conversations).toEqual([conversation]);
  await act(async () => result.current.setSelectedModel("custom"));
  expect(result.current.selectedModel).toBe("custom");
  api.listProviders.mockResolvedValue([
    provider,
    { ...provider, id: 3, defaultModel: "model-b" },
  ]);
  await act(async () => {
    api.getAccess.mockResolvedValue({
      state: "needs-opt-in",
      allowReadOnlyCommands: true,
    });
    await result.current.refreshAccess();
  });
  await act(async () => result.current.optIn());
  await waitFor(() => expect(result.current.providers).toHaveLength(2));
  await act(async () => result.current.setSelectedProviderId(3));
  expect(result.current.selectedModel).toBe("model-b");
});

test("opt-in enables access and then loads providers", async () => {
  api.getAccess.mockResolvedValue({
    state: "needs-opt-in",
    allowReadOnlyCommands: false,
  });
  const { result } = await renderHook(() => useAiChat());
  await waitFor(() =>
    expect(result.current.access).toMatchObject({ state: "needs-opt-in" }),
  );
  expect(api.listProviders).not.toHaveBeenCalled();
  await act(async () => result.current.optIn());
  expect(api.optIn).toHaveBeenCalledWith(true);
  await waitFor(() => expect(result.current.access).toEqual(ready));
  await waitFor(() => expect(result.current.selectedProviderId).toBe(2));
});

test("send appends a user, remembers the conversation, streams a reply and refreshes the list", async () => {
  const { result } = await mountReady();
  const stream = pendingStream();
  let sending!: Promise<boolean>;
  await act(async () => {
    sending = result.current.send("Hello");
  });
  expect(result.current.messages).toMatchObject([
    { role: "user", content: "Hello" },
  ]);
  expect(result.current.run?.finished).toBe(false);
  await act(async () => {
    stream.emit({ type: "conversation", conversationId: 8 });
    stream.emit({ type: "token", text: "Hello " });
    stream.emit({ type: "token", text: "there" });
    stream.emit({ type: "done" });
    stream.resolve();
    await sending;
  });
  expect(api.streamChat).toHaveBeenCalledWith(
    { providerId: "2", model: "model-a", message: "Hello" },
    expect.any(Function),
    expect.anything(),
  );
  expect(result.current.conversationId).toBe(8);
  expect(result.current.run).toMatchObject({
    text: "Hello there",
    finishReason: "done",
  });
  expect(api.listConversations).toHaveBeenCalledTimes(2);
  await act(async () => result.current.send("Next"));
  expect(
    result.current.messages.map(({ role, content }) => [role, content]),
  ).toEqual([
    ["user", "Hello"],
    ["assistant", "Hello there"],
    ["user", "Next"],
  ]);
  expect(api.streamChat.mock.calls[1][0].conversationId).toBe("8");
});

test.each(["done", "error"] as const)(
  "%s releases the stream before the response body ends and allows an immediate send",
  async (type) => {
    const { result } = await mountReady();
    const body = deferred<void>();
    let emit!: Parameters<AiApi["streamChat"]>[1];
    let signal!: AbortSignal;
    api.streamChat.mockImplementationOnce((_input, onEvent, abortSignal) => {
      emit = onEvent;
      signal = abortSignal;
      return body.promise;
    });
    const second = pendingStream();
    await act(async () => {
      expect(await result.current.send("First")).toBe(true);
      expect(await result.current.send("Too soon")).toBe(false);
      emit({ type: "token", text: "First reply" });
      emit(type === "done" ? { type } : { type, message: "Provider failed" });
    });
    expect(signal.aborted).toBe(true);
    expect(result.current.run).toMatchObject({
      finished: true,
      finishReason: type,
      error: type === "error" ? "Provider failed" : null,
    });
    expect(api.listConversations).toHaveBeenCalledTimes(2);
    await act(async () => {
      expect(await result.current.send("Second")).toBe(true);
    });
    expect(api.streamChat).toHaveBeenCalledTimes(2);
    await act(async () => {
      emit({ type: "token", text: "Late old token" });
      if (type === "done") body.resolve();
      else
        body.reject(
          Object.assign(new Error("Aborted"), { name: "AbortError" }),
        );
    });
    expect(result.current.run).toMatchObject({
      text: "",
      finished: false,
      error: null,
    });
    expect(second.signal().aborted).toBe(false);
    await act(async () => {
      second.emit({ type: "token", text: "Second reply" });
      second.emit({ type: "done" });
    });
    expect(result.current.run).toMatchObject({
      text: "Second reply",
      finishReason: "done",
      error: null,
    });
    expect(result.current.canResend).toBe(false);
  },
);

test("cancel retains partial output and ignores late frames", async () => {
  const { result } = await mountReady();
  const stream = pendingStream();
  let sending!: Promise<boolean>;
  await act(async () => {
    sending = result.current.send("Hello");
    stream.emit({ type: "token", text: "Partial" });
  });
  await act(async () => {
    result.current.cancel();
    await sending;
  });
  expect(stream.signal().aborted).toBe(true);
  expect(result.current.run).toMatchObject({
    text: "Partial",
    finishReason: "cancelled",
  });
  await act(async () => {
    stream.emit({ type: "token", text: "late" });
    stream.emit({ type: "done" });
  });
  expect(result.current.run).toMatchObject({
    text: "Partial",
    finishReason: "cancelled",
  });
});

test("only background interrupts, and resend uses the same conversation without duplicating the user", async () => {
  const { result } = await mountReady();
  const first = pendingStream();
  let sending!: Promise<boolean>;
  await act(async () => {
    sending = result.current.send("Hello");
    first.emit({ type: "conversation", conversationId: 8 });
    first.emit({ type: "token", text: "Partial" });
    appState("inactive");
  });
  expect(first.signal().aborted).toBe(false);
  expect(result.current.canResend).toBe(false);
  await act(async () => {
    appState("background");
    await sending;
  });
  expect(first.signal().aborted).toBe(true);
  expect(result.current.run).toMatchObject({
    text: "Partial",
    finishReason: "background",
  });
  expect(result.current.canResend).toBe(true);
  const retry = pendingStream();
  let resending!: Promise<void>;
  await act(async () => {
    resending = result.current.resend();
  });
  expect(api.streamChat.mock.calls[1][0]).toMatchObject({
    conversationId: "8",
    message: "Hello",
  });
  expect(result.current.messages).toHaveLength(1);
  expect(result.current.canResend).toBe(false);
  await act(async () => {
    retry.emit({ type: "token", text: "Complete" });
    retry.resolve();
    await resending;
  });
  expect(result.current.run).toMatchObject({
    text: "Complete",
    finishReason: "error",
    error: "Connection closed before the reply finished",
  });
  expect(result.current.canResend).toBe(true);
});

test.each([401, 403, 500])(
  "stream HTTP %s updates access or surfaces an error",
  async (status) => {
    const { result } = await mountReady();
    api.streamChat.mockRejectedValue(new AiApiError("Denied", status));
    if (status === 403) api.getAccess.mockResolvedValue({ state: "forbidden" });
    await act(async () => result.current.send("Hello"));
    expect(result.current.run).toMatchObject({
      finishReason: "error",
      error: "Denied",
    });
    if (status === 401)
      expect(result.current.access).toEqual({ state: "signed-out" });
    if (status === 403) {
      expect(api.getAccess).toHaveBeenCalledTimes(2);
      expect(result.current.access).toEqual({ state: "forbidden" });
    }
    if (status === 500) expect(result.current.error).toBe("Denied");
  },
);

test.each(["account", "client"])(
  "changing the %s aborts, resets all chat state and ignores stale results",
  async (change) => {
    const { result, rerender } = await mountReady();
    await act(async () => result.current.openConversation(8));
    const stream = pendingStream();
    let sending!: Promise<boolean>;
    await act(async () => {
      sending = result.current.send("Hello");
      stream.emit({ type: "token", text: "Old account" });
    });
    const access = deferred<AiAccess>();
    const nextApi = change === "account" ? api : makeApi();
    nextApi.getAccess.mockReturnValue(access.promise);
    jest.mocked(useFeatureContext).mockReturnValue({
      ...context,
      ...(change === "account"
        ? { account: { ...context.account, id: "account-b" } }
        : { client: { api: { ai: nextApi } } }),
    } as FeatureContext);
    await rerender(undefined);
    await act(async () => {
      await sending;
      stream.emit({ type: "conversation", conversationId: 99 });
      stream.emit({ type: "token", text: "Late" });
    });
    expect(stream.signal().aborted).toBe(true);
    expect(result.current).toMatchObject({
      access: "loading",
      providers: [],
      selectedProviderId: null,
      selectedModel: null,
      conversations: [],
      conversationId: null,
      messages: [],
      proposals: [],
      run: null,
      lastUserMessage: null,
      canResend: false,
      error: null,
    });
    await act(async () => access.resolve(ready));
  },
);

test("opening details filters history, new conversation clears it, and deletion updates the list", async () => {
  const { result } = await mountReady();
  await act(async () => result.current.openConversation(8));
  expect(result.current.messages.map(({ role }) => role)).toEqual([
    "user",
    "assistant",
  ]);
  expect(result.current.proposals).toEqual([proposal]);
  await act(async () => result.current.deleteConversation(8));
  expect(api.deleteConversation).toHaveBeenCalledWith(8);
  expect(result.current.conversations).toEqual([]);
  expect(result.current.conversationId).toBeNull();
  expect(result.current.messages).toEqual([]);
  expect(result.current.proposals).toEqual([]);
  await act(async () => result.current.openConversation(8));
  await act(async () => result.current.newConversation());
  expect(result.current.messages).toEqual([]);
});

test.each([
  [2, "saved-model"],
  [1, "model-a"],
  [99, "model-a"],
  [null, "model-a"],
])(
  "opening a conversation with provider %s selects model %s",
  async (providerId, expectedModel) => {
    const { result } = await mountReady();
    await act(async () =>
      result.current.setSelectedModel("custom-current-model"),
    );
    api.getConversation.mockResolvedValue({
      conversation: { ...conversation, providerId, model: "saved-model" },
      messages: [],
      proposals: [],
    });
    await act(async () => result.current.openConversation(8));
    expect(result.current.selectedProviderId).toBe(2);
    expect(result.current.selectedModel).toBe(expectedModel);
  },
);

test("non-chat conversations are ignored in lists and details", async () => {
  api.listConversations.mockResolvedValue([
    conversation,
    { ...conversation, id: 9, mode: "agent" },
  ]);
  const { result } = await mountReady();
  expect(result.current.conversations).toEqual([conversation]);
  api.getConversation.mockResolvedValue({
    conversation: { ...conversation, id: 9, mode: "agent" },
    messages: [message(1, "user")],
    proposals: [proposal],
  });
  await act(async () => result.current.openConversation(9));
  expect(result.current.conversationId).toBeNull();
  expect(result.current.messages).toEqual([]);
  expect(result.current.proposals).toEqual([]);
});

test("late details cannot overwrite a new conversation", async () => {
  const { result } = await mountReady();
  const detail = deferred<Awaited<ReturnType<AiApi["getConversation"]>>>();
  api.getConversation.mockReturnValue(detail.promise);
  let opening!: Promise<void>;
  await act(async () => {
    opening = result.current.openConversation(8);
  });
  await act(async () => result.current.newConversation());
  await act(async () => {
    detail.resolve({
      conversation,
      messages: [message(1, "user")],
      proposals: [proposal],
    });
    await opening;
  });
  expect(result.current.conversationId).toBeNull();
  expect(result.current.messages).toEqual([]);
});

test("apply and reject update stored and streamed proposals using only the ID", async () => {
  const { result } = await mountReady();
  await act(async () => result.current.openConversation(8));
  api.streamChat.mockImplementation(async (_input, emit) => {
    emit({ type: "proposal", proposal });
    emit({ type: "done" });
  });
  await act(async () => result.current.send("Read uptime"));
  expect(result.current.proposals).toHaveLength(1);
  await act(async () => result.current.applyProposal(10));
  expect(api.applyProposal).toHaveBeenCalledWith(10);
  expect(result.current.proposals[0]).toMatchObject({
    status: "applied",
    resultSummary: "Applied",
  });
  expect(result.current.run?.proposals[0].status).toBe("applied");
  await act(async () => result.current.rejectProposal(10));
  expect(api.rejectProposal).toHaveBeenCalledWith(10);
  expect(result.current.proposals[0].status).toBe("rejected");
});

test.each(["apply", "reject"] as const)(
  "%s results survive sending a message and update proposals by ID",
  async (action) => {
    const { result } = await mountReady();
    const other = { ...proposal, id: 11 };
    api.getConversation.mockResolvedValue({
      conversation,
      messages: [],
      proposals: [other, proposal],
    });
    await act(async () => result.current.openConversation(8));
    const application = deferred<Awaited<ReturnType<AiApi["applyProposal"]>>>();
    const rejection = deferred<void>();
    api.applyProposal.mockReturnValue(application.promise);
    api.rejectProposal.mockReturnValue(rejection.promise);
    let changing!: Promise<void>;
    const stream = pendingStream();
    await act(async () => {
      changing =
        action === "apply"
          ? result.current.applyProposal(10)
          : result.current.rejectProposal(10);
      expect(await result.current.send("Another message")).toBe(true);
      stream.emit({ type: "proposal", proposal });
      stream.emit({ type: "proposal", proposal: other });
    });
    await act(async () => {
      application.resolve({ success: true, summary: "Applied" });
      rejection.resolve();
      await changing;
    });
    const expectedStatus = action === "apply" ? "applied" : "rejected";
    expect(result.current.proposals.find(({ id }) => id === 10)?.status).toBe(
      expectedStatus,
    );
    expect(result.current.proposals.find(({ id }) => id === 11)?.status).toBe(
      "pending",
    );
    expect(
      result.current.run?.proposals.find(({ id }) => id === 10)?.status,
    ).toBe(expectedStatus);
    await act(async () => result.current.cancel());
  },
);

test.each(["failed", "applied"] as const)(
  "a thrown apply error refreshes the server's %s status in stored and streamed proposals",
  async (status) => {
    const { result } = await mountReady();
    await act(async () => result.current.openConversation(8));
    api.streamChat.mockImplementation(async (_input, emit) => {
      emit({ type: "proposal", proposal });
      emit({ type: "done" });
    });
    await act(async () => result.current.send("Read uptime"));
    api.applyProposal.mockRejectedValue(new Error("Connection lost"));
    const serverProposal = {
      ...proposal,
      status,
      resultSummary: "Server outcome",
    };
    api.getConversation.mockResolvedValue({
      conversation,
      messages: [],
      proposals: [serverProposal],
    });
    await act(async () => result.current.applyProposal(10));
    expect(api.getConversation).toHaveBeenCalledTimes(2);
    expect(api.getConversation).toHaveBeenLastCalledWith(8);
    expect(result.current.proposals).toEqual([serverProposal]);
    expect(result.current.run?.proposals).toEqual([serverProposal]);
    expect(result.current.error).toBe("Connection lost");
  },
);

test("a failed apply refetch does not revert another proposal's result", async () => {
  const { result } = await mountReady();
  const other = { ...proposal, id: 11 };
  api.getConversation.mockResolvedValue({
    conversation,
    messages: [],
    proposals: [proposal, other],
  });
  await act(async () => result.current.openConversation(8));
  api.streamChat.mockImplementation(async (_input, emit) => {
    emit({ type: "proposal", proposal });
    emit({ type: "proposal", proposal: other });
    emit({ type: "done" });
  });
  await act(async () => result.current.send("Read uptime"));
  await act(async () => result.current.applyProposal(11));
  api.applyProposal.mockRejectedValue(new AiApiError("Failed", 500));
  const refreshed: AiProposal = { ...proposal, status: "failed" };
  api.getConversation.mockResolvedValue({
    conversation,
    messages: [],
    proposals: [refreshed, other],
  });
  await act(async () => result.current.applyProposal(10));
  expect(result.current.proposals.find(({ id }) => id === 10)).toEqual(
    refreshed,
  );
  expect(result.current.proposals.find(({ id }) => id === 11)?.status).toBe(
    "applied",
  );
  expect(
    result.current.run?.proposals.find(({ id }) => id === 11)?.status,
  ).toBe("applied");
  expect(result.current.lockedProposals).toEqual([]);
});

test.each([new Error("Network error"), new AiApiError("Timed out")])(
  "an apply error without an HTTP status locks a still-pending proposal: %s",
  async (error) => {
    const { result } = await mountReady();
    await act(async () => result.current.openConversation(8));
    api.applyProposal.mockRejectedValue(error);
    await act(async () => result.current.applyProposal(10));
    expect(result.current.proposals[0].status).toBe("pending");
    expect(result.current.lockedProposals).toEqual([10]);
    api.getConversation.mockRejectedValueOnce(new Error("Refresh failed"));
    await act(async () => result.current.applyProposal(10));
    expect(result.current.lockedProposals).toEqual([10]);
    api.getConversation.mockResolvedValueOnce({
      conversation,
      messages: [],
      proposals: [{ ...proposal, status: "applied" }],
    });
    await act(async () => result.current.applyProposal(10));
    expect(result.current.lockedProposals).toEqual([]);
    await act(async () => result.current.applyProposal(10));
    expect(result.current.lockedProposals).toEqual([10]);
    await act(async () => result.current.openConversation(8));
    expect(result.current.lockedProposals).toEqual([]);
    await act(async () => result.current.applyProposal(10));
    expect(result.current.lockedProposals).toEqual([10]);
    await act(async () => result.current.newConversation());
    expect(result.current.lockedProposals).toEqual([]);
  },
);

test("proposal results from a previous conversation generation are ignored", async () => {
  const { result } = await mountReady();
  await act(async () => result.current.openConversation(8));
  const pending = deferred<Awaited<ReturnType<AiApi["applyProposal"]>>>();
  api.applyProposal.mockReturnValue(pending.promise);
  let applying!: Promise<void>;
  await act(async () => {
    applying = result.current.applyProposal(10);
    result.current.newConversation();
    await result.current.openConversation(8);
  });
  await act(async () => {
    pending.resolve({ success: true, summary: "Old result" });
    await applying;
  });
  expect(result.current.proposals).toEqual([proposal]);
});

test("unsuccessful applications and request errors are surfaced", async () => {
  const { result } = await mountReady();
  await act(async () => result.current.openConversation(8));
  api.applyProposal.mockResolvedValue({
    success: false,
    summary: "Command failed",
  });
  await act(async () => result.current.applyProposal(10));
  expect(result.current.proposals[0]).toMatchObject({
    status: "failed",
    resultSummary: "Command failed",
  });
  expect(result.current.error).toBe("Command failed");
  api.rejectProposal.mockRejectedValue(new AiApiError("Could not reject"));
  await act(async () => result.current.rejectProposal(10));
  expect(result.current.error).toBe("Could not reject");
  expect(result.current.proposals[0].status).toBe("failed");
});

test("unmount aborts the stream and removes the AppState listener", async () => {
  const { result, unmount } = await mountReady();
  const stream = pendingStream();
  let sending!: Promise<boolean>;
  await act(async () => {
    sending = result.current.send("Hello");
  });
  await unmount();
  await sending;
  expect(stream.signal().aborted).toBe(true);
  expect(removeListener).toHaveBeenCalledTimes(1);
});

test("history and proposal helpers preserve inputs and keep the newest proposal", () => {
  const messages = [
    message(1, "user"),
    message(2, "tool"),
    message(3, "summary"),
  ];
  const run = finishRun(
    applyEvent(initialRun(), { type: "token", text: "Partial" }),
    "cancelled",
  );
  const history = buildHistory(messages, run);
  expect(history.map(({ role }) => role)).toEqual(["user", "assistant"]);
  expect(history[1].content).toBe("Partial");
  expect(messages).toHaveLength(3);
  expect(buildHistory(messages, initialRun())).toHaveLength(1);
  const applied: AiProposal = { ...proposal, status: "applied" };
  expect(mergeProposals([proposal], [applied])).toEqual([applied]);
  expect(proposal.status).toBe("pending");
});
