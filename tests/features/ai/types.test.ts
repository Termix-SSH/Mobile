import {
  parseConversationDetail,
  parseConversations,
  parseProposal,
  parseProviders,
  parseStatus,
} from "@/features/ai/types";

const timestamp = "2026-10-23T12:00:00Z";
const provider = {
  id: 1,
  providerType: "openai",
  label: "Work",
  baseUrl: "https://api.example.com",
  apiKeyPrefix: "sk-12",
  defaultModel: "model-1",
  modelOverrides: { "model-1": { contextWindow: 128_000 } },
  advanced: {
    endpoint: "responses",
    reasoningEffort: "high",
    reasoningSummary: "concise",
    verbosity: "low",
    maxOutputTokens: 4096,
    temperature: 0.5,
  },
  enabled: true,
  createdAt: timestamp,
};
const conversation = {
  id: 2,
  title: "Check the server",
  providerId: 1,
  model: "model-1",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const message = {
  id: 3,
  conversationId: 2,
  role: "assistant",
  content: "The server is healthy.",
  toolCalls: null,
  reasoning: "Checked its status.",
  createdAt: timestamp,
};
const proposal = {
  id: 4,
  conversationId: 2,
  kind: "run_command",
  summary: "Read uptime",
  payload: '{"command":"uptime"}',
  status: "pending",
  resultSummary: null,
  createdAt: timestamp,
};

test("status requires booleans and strips extra fields", () => {
  const status = {
    globallyEnabled: true,
    enabled: false,
    allowReadOnlyCommands: true,
  };
  expect(parseStatus({ ...status, apiKey: "secret" })).toEqual(status);
  for (const data of [
    null,
    [],
    {},
    { ...status, globallyEnabled: 1 },
    { ...status, enabled: "true" },
    { ...status, allowReadOnlyCommands: undefined },
  ]) {
    expect(parseStatus(data)).toBeNull();
  }
});

test("providers preserve public fields and strip secrets at every level", () => {
  expect(
    parseProviders({
      providers: [
        {
          ...provider,
          apiKey: "secret",
          advanced: { ...provider.advanced, apiKey: "secret" },
          modelOverrides: {
            "model-1": { contextWindow: 128_000, apiKey: "secret" },
          },
        },
      ],
      apiKey: "secret",
    }),
  ).toEqual([provider]);
  for (const providerType of [
    "ollama",
    "anthropic",
    "openai",
    "gemini",
    "openai_compatible",
  ]) {
    expect(
      parseProviders({ providers: [{ ...provider, providerType }] }),
    ).toEqual([{ ...provider, providerType }]);
  }
});

test("provider identities and types are validated; optional fields normalize", () => {
  expect(
    parseProviders({
      providers: [
        null,
        [],
        {},
        { ...provider, id: "1" },
        { ...provider, id: 0 },
        { ...provider, id: -1 },
        { ...provider, id: 1.5 },
        { ...provider, id: Number.MAX_SAFE_INTEGER + 1 },
        { ...provider, id: NaN },
        { ...provider, providerType: "unknown" },
        {
          id: 8,
          providerType: "ollama",
          label: null,
          baseUrl: 3,
          apiKeyPrefix: {},
          defaultModel: [],
          modelOverrides: [],
          advanced: null,
          enabled: "true",
          createdAt: false,
        },
      ],
    }),
  ).toEqual([
    {
      id: 8,
      providerType: "ollama",
      label: "",
      baseUrl: null,
      apiKeyPrefix: null,
      defaultModel: null,
      modelOverrides: {},
      advanced: {},
      enabled: false,
      createdAt: "",
    },
  ]);
});

test("provider settings retain only valid model overrides and request values", () => {
  const parsed = parseProviders({
    providers: [
      {
        ...provider,
        modelOverrides: {
          valid: { contextWindow: 8192 },
          empty: {},
          " ": { contextWindow: 8192 },
          zero: { contextWindow: 0 },
          fractional: { contextWindow: 1.5 },
          infinite: { contextWindow: Infinity },
          string: { contextWindow: "8192" },
          malformed: null,
        },
        advanced: {
          endpoint: "legacy",
          reasoningEffort: "extreme",
          reasoningSummary: "none",
          verbosity: "verbose",
          maxOutputTokens: 1_000_001,
          temperature: NaN,
        },
      },
    ],
  });
  expect(parsed?.[0].modelOverrides).toEqual({
    valid: { contextWindow: 8192 },
    empty: {},
  });
  expect(parsed?.[0].advanced).toEqual({});
  for (const advanced of [
    { endpoint: "auto", maxOutputTokens: 1, temperature: 0 },
    { endpoint: "chat", maxOutputTokens: 1_000_000, temperature: 2 },
    { reasoningEffort: "none", reasoningSummary: "off", verbosity: "medium" },
    { reasoningEffort: "minimal", reasoningSummary: "auto", verbosity: "high" },
    { reasoningEffort: "low", reasoningSummary: "detailed" },
    { reasoningEffort: "medium" },
    { reasoningEffort: "xhigh" },
    { reasoningEffort: "max" },
  ]) {
    expect(
      parseProviders({ providers: [{ ...provider, advanced }] })?.[0].advanced,
    ).toEqual(advanced);
  }
  for (const advanced of [
    { maxOutputTokens: 0, temperature: -0.1 },
    { maxOutputTokens: 2.5, temperature: 2.1 },
    { maxOutputTokens: "10", temperature: Infinity },
  ]) {
    expect(
      parseProviders({ providers: [{ ...provider, advanced }] })?.[0].advanced,
    ).toEqual({});
  }
});

test("conversation lists skip bad identities and normalize optional values", () => {
  expect(
    parseConversations({
      conversations: [
        { ...conversation, apiKey: "secret" },
        null,
        {},
        { id: "2" },
        { id: Infinity },
        { id: 0 },
        { id: 5, title: 42, providerId: -1, model: false },
      ],
    }),
  ).toEqual([
    conversation,
    {
      id: 5,
      title: null,
      providerId: null,
      model: null,
      createdAt: "",
      updatedAt: "",
    },
  ]);
});

test("collection parsers require their named array envelope", () => {
  for (const data of [
    null,
    undefined,
    [],
    "offline",
    {},
    { providers: null },
  ]) {
    expect(parseProviders(data)).toBeNull();
  }
  for (const data of [null, [], {}, { conversations: {} }]) {
    expect(parseConversations(data)).toBeNull();
  }
  expect(parseProviders({ providers: [] })).toEqual([]);
  expect(parseConversations({ conversations: [] })).toEqual([]);
});

test("detail parses all message roles and proposal statuses without extra fields", () => {
  const messages = ["user", "assistant", "tool", "summary"].map((role) => ({
    ...message,
    role,
  }));
  const proposals = ["pending", "applied", "failed", "rejected", "expired"].map(
    (status) => ({ ...proposal, status }),
  );
  expect(
    parseConversationDetail({
      conversation: { ...conversation, apiKey: "secret" },
      messages: messages.map((item) => ({ ...item, apiKey: "secret" })),
      proposals: proposals.map((item) => ({ ...item, apiKey: "secret" })),
      apiKey: "secret",
    }),
  ).toEqual({ conversation, messages, proposals });
});

test("conversation parsers preserve a known mode", () => {
  expect(
    parseConversations({ conversations: [{ ...conversation, mode: "agent" }] }),
  ).toEqual([{ ...conversation, mode: "agent" }]);
  expect(
    parseConversationDetail({
      conversation: { ...conversation, mode: "chat" },
      messages: [],
      proposals: [],
    })?.conversation.mode,
  ).toBe("chat");
});

test("detail skips malformed messages and proposals and normalizes metadata", () => {
  expect(
    parseConversationDetail({
      conversation,
      messages: [
        null,
        {},
        { ...message, id: "3" },
        { ...message, conversationId: 0 },
        { ...message, role: "system" },
        { ...message, content: {} },
        { ...message, toolCalls: {}, reasoning: 42, createdAt: null },
        { ...message, reasoning: undefined },
      ],
      proposals: [null, { ...proposal, status: "running" }, proposal],
    }),
  ).toEqual({
    conversation,
    messages: [
      { ...message, toolCalls: null, reasoning: null, createdAt: "" },
      {
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        toolCalls: null,
        createdAt: timestamp,
      },
    ],
    proposals: [proposal],
  });
});

test("detail rejects incomplete envelopes", () => {
  for (const data of [
    null,
    [],
    {},
    { conversation, messages: [] },
    { conversation, messages: [], proposals: null },
    { conversation, messages: {}, proposals: [] },
    { conversation: { id: -1 }, messages: [], proposals: [] },
  ]) {
    expect(parseConversationDetail(data)).toBeNull();
  }
});

test("proposal parser validates identity, payload, kind, and status", () => {
  expect(parseProposal({ ...proposal, apiKey: "secret" })).toEqual(proposal);
  expect(
    parseProposal({
      ...proposal,
      summary: {},
      resultSummary: 12,
      createdAt: undefined,
    }),
  ).toEqual({ ...proposal, summary: null, resultSummary: null, createdAt: "" });
  for (const data of [
    null,
    [],
    {},
    { ...proposal, id: 1.5 },
    { ...proposal, conversationId: "2" },
    { ...proposal, kind: null },
    { ...proposal, kind: " " },
    { ...proposal, payload: {} },
    { ...proposal, status: "complete" },
    { proposal },
  ]) {
    expect(parseProposal(data)).toBeNull();
  }
});
