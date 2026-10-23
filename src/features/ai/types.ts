/** SSE frames stay untrusted until the run reducer validates their fields. */
export type AiStreamEvent = unknown;

export interface AiStatus {
  globallyEnabled: boolean;
  enabled: boolean;
  allowReadOnlyCommands: boolean;
}

export type AiProviderType =
  "ollama" | "anthropic" | "openai" | "gemini" | "openai_compatible";

export type ModelOverrides = Record<string, { contextWindow?: number }>;

export type ReasoningEffort =
  "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ProviderAdvanced {
  endpoint?: "auto" | "responses" | "chat";
  reasoningEffort?: ReasoningEffort;
  reasoningSummary?: "auto" | "concise" | "detailed" | "off";
  verbosity?: "low" | "medium" | "high";
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AiProvider {
  id: number;
  providerType: AiProviderType;
  label: string;
  baseUrl: string | null;
  /** Only the server's redacted prefix belongs in a provider response. */
  apiKeyPrefix: string | null;
  defaultModel: string | null;
  modelOverrides: ModelOverrides;
  advanced: ProviderAdvanced;
  enabled: boolean;
  createdAt: string;
}

export interface AiConversation {
  id: number;
  title: string | null;
  providerId: number | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: number;
  conversationId: number;
  role: "user" | "assistant" | "tool" | "summary";
  content: string;
  toolCalls: string | null;
  reasoning?: string | null;
  createdAt: string;
}

export interface AiProposal {
  id: number;
  conversationId: number;
  kind: string;
  summary: string | null;
  payload: string;
  status: "pending" | "applied" | "rejected" | "expired";
  resultSummary: string | null;
  createdAt: string;
}

export interface AiConversationDetail {
  conversation: AiConversation;
  messages: AiMessage[];
  proposals: AiProposal[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isOneOf<T extends string>(
  value: unknown,
  choices: readonly T[],
): value is T {
  return (
    typeof value === "string" && choices.some((choice) => choice === value)
  );
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseStatus(data: unknown): AiStatus | null {
  if (
    !isRecord(data) ||
    typeof data.globallyEnabled !== "boolean" ||
    typeof data.enabled !== "boolean" ||
    typeof data.allowReadOnlyCommands !== "boolean"
  ) {
    return null;
  }
  return {
    globallyEnabled: data.globallyEnabled,
    enabled: data.enabled,
    allowReadOnlyCommands: data.allowReadOnlyCommands,
  };
}

function parseModelOverrides(data: unknown): ModelOverrides {
  if (!isRecord(data)) return {};
  const entries: [string, { contextWindow?: number }][] = [];
  for (const [model, settings] of Object.entries(data)) {
    if (!model.trim() || !isRecord(settings)) continue;
    if (settings.contextWindow === undefined) {
      entries.push([model, {}]);
    } else if (isId(settings.contextWindow)) {
      entries.push([model, { contextWindow: settings.contextWindow }]);
    }
  }
  return Object.fromEntries(entries);
}

function parseAdvanced(data: unknown): ProviderAdvanced {
  if (!isRecord(data)) return {};
  const advanced: ProviderAdvanced = {};
  if (isOneOf(data.endpoint, ["auto", "responses", "chat"])) {
    advanced.endpoint = data.endpoint;
  }
  if (
    isOneOf(data.reasoningEffort, [
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
  ) {
    advanced.reasoningEffort = data.reasoningEffort;
  }
  if (isOneOf(data.reasoningSummary, ["auto", "concise", "detailed", "off"])) {
    advanced.reasoningSummary = data.reasoningSummary;
  }
  if (isOneOf(data.verbosity, ["low", "medium", "high"])) {
    advanced.verbosity = data.verbosity;
  }
  if (isId(data.maxOutputTokens) && data.maxOutputTokens <= 1_000_000) {
    advanced.maxOutputTokens = data.maxOutputTokens;
  }
  if (
    typeof data.temperature === "number" &&
    Number.isFinite(data.temperature) &&
    data.temperature >= 0 &&
    data.temperature <= 2
  ) {
    advanced.temperature = data.temperature;
  }
  return advanced;
}

function parseProvider(data: unknown): AiProvider | null {
  if (
    !isRecord(data) ||
    !isId(data.id) ||
    !isOneOf(data.providerType, [
      "ollama",
      "anthropic",
      "openai",
      "gemini",
      "openai_compatible",
    ])
  ) {
    return null;
  }
  return {
    id: data.id,
    providerType: data.providerType,
    label: typeof data.label === "string" ? data.label : "",
    baseUrl: nullableString(data.baseUrl),
    apiKeyPrefix: nullableString(data.apiKeyPrefix),
    defaultModel: nullableString(data.defaultModel),
    modelOverrides: parseModelOverrides(data.modelOverrides),
    advanced: parseAdvanced(data.advanced),
    enabled: data.enabled === true,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
  };
}

export function parseProviders(data: unknown): AiProvider[] | null {
  if (!isRecord(data) || !Array.isArray(data.providers)) return null;
  return data.providers.flatMap((value) => {
    const provider = parseProvider(value);
    return provider ? [provider] : [];
  });
}

function parseConversation(data: unknown): AiConversation | null {
  if (!isRecord(data) || !isId(data.id)) return null;
  return {
    id: data.id,
    title: nullableString(data.title),
    providerId: isId(data.providerId) ? data.providerId : null,
    model: nullableString(data.model),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
  };
}

export function parseConversations(data: unknown): AiConversation[] | null {
  if (!isRecord(data) || !Array.isArray(data.conversations)) return null;
  return data.conversations.flatMap((value) => {
    const conversation = parseConversation(value);
    return conversation ? [conversation] : [];
  });
}

function parseMessage(data: unknown): AiMessage | null {
  if (
    !isRecord(data) ||
    !isId(data.id) ||
    !isId(data.conversationId) ||
    !isOneOf(data.role, ["user", "assistant", "tool", "summary"]) ||
    typeof data.content !== "string"
  ) {
    return null;
  }
  return {
    id: data.id,
    conversationId: data.conversationId,
    role: data.role,
    content: data.content,
    toolCalls: nullableString(data.toolCalls),
    ...(data.reasoning !== undefined
      ? { reasoning: nullableString(data.reasoning) }
      : {}),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
  };
}

export function parseProposal(data: unknown): AiProposal | null {
  if (
    !isRecord(data) ||
    !isId(data.id) ||
    !isId(data.conversationId) ||
    typeof data.kind !== "string" ||
    !data.kind.trim() ||
    typeof data.payload !== "string" ||
    !isOneOf(data.status, ["pending", "applied", "rejected", "expired"])
  ) {
    return null;
  }
  return {
    id: data.id,
    conversationId: data.conversationId,
    kind: data.kind,
    summary: nullableString(data.summary),
    payload: data.payload,
    status: data.status,
    resultSummary: nullableString(data.resultSummary),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
  };
}

export function parseConversationDetail(
  data: unknown,
): AiConversationDetail | null {
  if (
    !isRecord(data) ||
    !Array.isArray(data.messages) ||
    !Array.isArray(data.proposals)
  ) {
    return null;
  }
  const conversation = parseConversation(data.conversation);
  if (!conversation) return null;
  return {
    conversation,
    messages: data.messages.flatMap((value) => {
      const message = parseMessage(value);
      return message ? [message] : [];
    }),
    proposals: data.proposals.flatMap((value) => {
      const proposal = parseProposal(value);
      return proposal ? [proposal] : [];
    }),
  };
}
