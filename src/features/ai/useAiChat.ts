import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { AiApiError } from "@/core/api/modules/ai";
import { useFeatureContext } from "@/core/features/hooks";
import type { AiAccess } from "./access";
import { applyEvent, finishRun, initialRun, type RunState } from "./run";
import type {
  AiConversation,
  AiMessage,
  AiProposal,
  AiProvider,
} from "./types";

/** Later copies win, so local proposal results can replace streamed copies. */
export function mergeProposals(...groups: AiProposal[][]): AiProposal[] {
  const proposals = new Map<number, AiProposal>();
  for (const group of groups) {
    for (const proposal of group) proposals.set(proposal.id, proposal);
  }
  return [...proposals.values()];
}

function nextLocalId(messages: AiMessage[]): number {
  return Math.min(0, ...messages.map(({ id }) => id)) - 1;
}

/** Commit the previous reply before starting another run; omit tool records. */
export function buildHistory(
  messages: AiMessage[],
  run: RunState | null = null,
): AiMessage[] {
  const history = messages.filter(
    ({ role }) => role === "user" || role === "assistant",
  );
  if (run?.finished && run.text) {
    history.push({
      id: nextLocalId(history),
      conversationId: run.conversationId ?? history.at(-1)?.conversationId ?? 0,
      role: "assistant",
      content: run.text,
      reasoning: run.reasoning,
      toolCalls: null,
      createdAt: "",
    });
  }
  return history;
}

interface ChatState {
  access: AiAccess | "loading";
  providers: AiProvider[];
  selectedProviderId: number | null;
  selectedModel: string | null;
  conversations: AiConversation[];
  conversationId: number | null;
  messages: AiMessage[];
  run: RunState | null;
  proposals: AiProposal[];
  lastUserMessage: string | null;
  error: string | null;
}

function emptyState(): ChatState {
  return {
    access: "loading",
    providers: [],
    selectedProviderId: null,
    selectedModel: null,
    conversations: [],
    conversationId: null,
    messages: [],
    run: null,
    proposals: [],
    lastUserMessage: null,
    error: null,
  };
}

const isChat = (conversation: AiConversation) =>
  conversation.mode === undefined || conversation.mode === "chat";
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "AI request failed";

export function useAiChat() {
  const { account, client } = useFeatureContext();
  const scope = useMemo(
    () => ({
      active: false,
      view: 0,
      conversationGeneration: 0,
      accessRequest: 0,
      listRequest: 0,
    }),
    // A client can be reused when switching accounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account.id, client],
  );
  const [state, setState] = useState<ChatState>(emptyState);
  const current = useRef(state);
  const stream = useRef<AbortController | null>(null);

  // Keep event handlers synchronous even when several SSE frames are batched.
  const update = useCallback((change: (previous: ChatState) => ChatState) => {
    current.current = change(current.current);
    setState(current.current);
  }, []);

  const refreshAccess = useCallback(async () => {
    const request = ++scope.accessRequest;
    let access: AiAccess;
    try {
      access = client
        ? await client.api.ai.getAccess()
        : { state: "signed-out" };
    } catch (error) {
      access =
        error instanceof AiApiError && error.status === 401
          ? { state: "signed-out" }
          : { state: "error", message: errorMessage(error) };
    }
    if (scope.active && request === scope.accessRequest) {
      update((previous) => ({ ...previous, access }));
    }
  }, [client, scope, update]);

  const reportError = useCallback(
    async (error: unknown) => {
      if (!scope.active) return;
      update((previous) => ({ ...previous, error: errorMessage(error) }));
      if (error instanceof AiApiError) {
        if (error.status === 401) {
          scope.accessRequest += 1;
          update((previous) => ({
            ...previous,
            access: { state: "signed-out" },
          }));
        } else if (error.status === 403) {
          await refreshAccess();
        }
      }
    },
    [scope, update, refreshAccess],
  );

  const stopStream = useCallback(
    (reason: "cancelled" | "background") => {
      const controller = stream.current;
      if (!controller) return;
      stream.current = null;
      controller.abort();
      update((previous) => ({
        ...previous,
        run: previous.run ? finishRun(previous.run, reason) : null,
      }));
    },
    [update],
  );

  useEffect(() => {
    scope.active = true;
    update(emptyState);
    void refreshAccess();
    return () => {
      scope.active = false;
      scope.view += 1;
      scope.conversationGeneration += 1;
      stream.current?.abort();
      stream.current = null;
    };
  }, [scope, refreshAccess, update]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background") stopStream("background");
    });
    return () => subscription.remove();
  }, [stopStream]);

  const refreshConversations = useCallback(async () => {
    if (!client || !scope.active) return;
    const request = ++scope.listRequest;
    try {
      const conversations = await client.api.ai.listConversations();
      if (scope.active && request === scope.listRequest) {
        update((previous) => ({
          ...previous,
          conversations: conversations.filter(isChat),
        }));
      }
    } catch (error) {
      if (request === scope.listRequest) await reportError(error);
    }
  }, [client, scope, update, reportError]);

  const accessState =
    state.access === "loading" ? "loading" : state.access.state;
  useEffect(() => {
    if (accessState !== "ready" || !client) return;
    // After an account switch the reset state is already in the ref while this
    // render still carries the previous account's "ready" access.
    const access = current.current.access;
    if (access === "loading" || access.state !== "ready") return;
    let active = true;
    void client.api.ai
      .listProviders()
      .then((providers) => {
        if (!active || !scope.active) return;
        update((previous) => {
          const selected = providers.find(
            (provider) =>
              provider.enabled && provider.id === previous.selectedProviderId,
          );
          const provider =
            selected ?? providers.find((provider) => provider.enabled);
          return {
            ...previous,
            providers,
            selectedProviderId: provider?.id ?? null,
            selectedModel: selected
              ? previous.selectedModel
              : (provider?.defaultModel ?? null),
          };
        });
      })
      .catch((error: unknown) => {
        if (active) void reportError(error);
      });
    void refreshConversations();
    return () => {
      active = false;
    };
  }, [accessState, client, scope, update, refreshConversations, reportError]);

  const optIn = useCallback(async () => {
    if (!client || !scope.active) return;
    const request = ++scope.accessRequest;
    try {
      const access = await client.api.ai.optIn(true);
      if (scope.active && request === scope.accessRequest) {
        update((previous) => ({ ...previous, access, error: null }));
      }
    } catch (error) {
      await reportError(error);
    }
  }, [client, scope, update, reportError]);

  const setSelectedProviderId = useCallback(
    (id: number | null) => {
      if (!scope.active) return;
      update((previous) => ({
        ...previous,
        selectedProviderId: id,
        selectedModel:
          previous.providers.find((provider) => provider.id === id)
            ?.defaultModel ?? null,
      }));
    },
    [scope, update],
  );

  const setSelectedModel = useCallback(
    (model: string | null) => {
      if (scope.active)
        update((previous) => ({ ...previous, selectedModel: model }));
    },
    [scope, update],
  );

  const newConversation = useCallback(() => {
    if (!scope.active) return;
    stopStream("cancelled");
    scope.view += 1;
    scope.conversationGeneration += 1;
    update((previous) => ({
      ...previous,
      conversationId: null,
      messages: [],
      proposals: [],
      run: null,
      lastUserMessage: null,
      error: null,
    }));
  }, [scope, stopStream, update]);

  const openConversation = useCallback(
    async (id: number) => {
      if (!client || !scope.active) return;
      const known = current.current.conversations.find(
        (conversation) => conversation.id === id,
      );
      if (known && !isChat(known)) return;
      newConversation();
      const view = scope.view;
      try {
        const detail = await client.api.ai.getConversation(id);
        if (
          !scope.active ||
          scope.view !== view ||
          !isChat(detail.conversation)
        )
          return;
        update((previous) => {
          const provider = previous.providers.find(
            (provider) =>
              provider.enabled &&
              provider.id === detail.conversation.providerId,
          );
          return {
            ...previous,
            conversationId: detail.conversation.id,
            messages: buildHistory(detail.messages),
            proposals: mergeProposals(detail.proposals),
            selectedProviderId: provider?.id ?? previous.selectedProviderId,
            selectedModel: provider
              ? (detail.conversation.model ?? provider.defaultModel)
              : (previous.providers.find(
                  (candidate) =>
                    candidate.enabled &&
                    candidate.id === previous.selectedProviderId,
                )?.defaultModel ?? null),
          };
        });
      } catch (error) {
        if (scope.view === view) await reportError(error);
      }
    },
    [client, scope, newConversation, update, reportError],
  );

  const deleteConversation = useCallback(
    async (id: number) => {
      if (!client || !scope.active) return;
      try {
        await client.api.ai.deleteConversation(id);
        if (!scope.active) return;
        // Invalidate an older list request that could restore the deleted row.
        scope.listRequest += 1;
        if (current.current.conversationId === id) newConversation();
        update((previous) => ({
          ...previous,
          conversations: previous.conversations.filter(
            (conversation) => conversation.id !== id,
          ),
        }));
      } catch (error) {
        await reportError(error);
      }
    },
    [client, scope, newConversation, update, reportError],
  );

  const startSend = useCallback(
    async (text: string, retry = false): Promise<boolean> => {
      if (!client || !scope.active || stream.current || !text.trim())
        return false;
      const previous = current.current;
      if (previous.access === "loading" || previous.access.state !== "ready")
        return false;
      const provider = previous.providers.find(
        (provider) =>
          provider.enabled && provider.id === previous.selectedProviderId,
      );
      if (!provider) {
        update((previous) => ({
          ...previous,
          error: "Select an enabled AI provider",
        }));
        return false;
      }
      // A pending detail must not overwrite an optimistic message or this run.
      const view = ++scope.view;
      const controller = new AbortController();
      stream.current = controller;
      const isCurrent = () =>
        scope.active && scope.view === view && stream.current === controller;
      update((previous) => {
        const messages = retry
          ? previous.messages
          : buildHistory(previous.messages, previous.run);
        return {
          ...previous,
          messages: retry
            ? messages
            : [
                ...messages,
                {
                  id: nextLocalId(messages),
                  conversationId: previous.conversationId ?? 0,
                  role: "user",
                  content: text,
                  toolCalls: null,
                  createdAt: "",
                },
              ],
          proposals: mergeProposals(
            previous.proposals,
            previous.run?.proposals ?? [],
          ),
          run: { ...initialRun(), conversationId: previous.conversationId },
          lastUserMessage: text,
          error: null,
        };
      });
      void (async () => {
        try {
          await client.api.ai.streamChat(
            {
              ...(previous.conversationId !== null
                ? { conversationId: String(previous.conversationId) }
                : {}),
              providerId: String(provider.id),
              ...(previous.selectedModel
                ? { model: previous.selectedModel }
                : {}),
              message: text,
            },
            (event) => {
              if (!isCurrent()) return;
              update((previous) => {
                const run = applyEvent(previous.run ?? initialRun(), event);
                return {
                  ...previous,
                  run,
                  conversationId: run.conversationId ?? previous.conversationId,
                };
              });
              if (current.current.run?.finished) {
                stream.current = null;
                controller.abort();
                void refreshConversations();
              }
            },
            controller.signal,
          );
          if (!isCurrent()) return;
          stream.current = null;
          update((previous) => ({
            ...previous,
            run:
              previous.run && !previous.run.finished
                ? finishRun(
                    {
                      ...previous.run,
                      error: "Connection closed before the reply finished",
                    },
                    "error",
                  )
                : previous.run,
          }));
          await refreshConversations();
        } catch (error) {
          if (!isCurrent()) return;
          stream.current = null;
          const aborted = error instanceof Error && error.name === "AbortError";
          update((previous) => ({
            ...previous,
            run: previous.run
              ? finishRun(
                  {
                    ...previous.run,
                    error: aborted ? previous.run.error : errorMessage(error),
                  },
                  aborted ? "cancelled" : "error",
                )
              : null,
          }));
          if (!aborted) await reportError(error);
        }
      })();
      return true;
    },
    [client, scope, update, refreshConversations, reportError],
  );

  const send = useCallback((text: string) => startSend(text), [startSend]);
  const cancel = useCallback(() => stopStream("cancelled"), [stopStream]);
  const canResend =
    !!state.lastUserMessage &&
    !!state.run?.finished &&
    state.run.finishReason !== "done";
  const resend = useCallback(async () => {
    const { run, lastUserMessage } = current.current;
    if (lastUserMessage && run?.finished && run.finishReason !== "done") {
      await startSend(lastUserMessage, true);
    }
  }, [startSend]);

  const changeProposal = useCallback(
    async (id: number, action: "apply" | "reject") => {
      if (!client || !scope.active) return;
      const generation = scope.conversationGeneration;
      const isCurrent = () =>
        scope.active && scope.conversationGeneration === generation;
      update((previous) => ({ ...previous, error: null }));
      try {
        const result =
          action === "apply"
            ? await client.api.ai.applyProposal(id)
            : await client.api.ai.rejectProposal(id);
        if (!isCurrent()) return;
        update((previous) => {
          const revise = (proposal: AiProposal): AiProposal =>
            proposal.id !== id
              ? proposal
              : {
                  ...proposal,
                  status:
                    action === "reject"
                      ? "rejected"
                      : result?.success
                        ? "applied"
                        : "failed",
                  resultSummary: result?.summary ?? proposal.resultSummary,
                };
          return {
            ...previous,
            proposals: previous.proposals.map(revise),
            run: previous.run
              ? {
                  ...previous.run,
                  proposals: previous.run.proposals.map(revise),
                }
              : null,
            error: result && !result.success ? result.summary : previous.error,
          };
        });
      } catch (error) {
        if (!isCurrent()) return;
        await reportError(error);
        const conversationId = current.current.conversationId;
        if (action !== "apply" || !isCurrent() || conversationId === null)
          return;
        try {
          const detail = await client.api.ai.getConversation(conversationId);
          if (!isCurrent() || detail.conversation.id !== conversationId) return;
          update((previous) => {
            const proposals = mergeProposals(
              previous.proposals,
              previous.run?.proposals ?? [],
              detail.proposals,
            );
            const byId = new Map(
              proposals.map((proposal) => [proposal.id, proposal]),
            );
            return {
              ...previous,
              proposals,
              run: previous.run
                ? {
                    ...previous.run,
                    proposals: previous.run.proposals.map(
                      (proposal) => byId.get(proposal.id) ?? proposal,
                    ),
                  }
                : null,
            };
          });
        } catch {
          // Keep the original apply error when refreshing also fails.
        }
      }
    },
    [client, scope, update, reportError],
  );
  const applyProposal = useCallback(
    (id: number) => changeProposal(id, "apply"),
    [changeProposal],
  );
  const rejectProposal = useCallback(
    (id: number) => changeProposal(id, "reject"),
    [changeProposal],
  );

  return {
    ...state,
    proposals: mergeProposals(state.proposals, state.run?.proposals ?? []),
    refreshAccess,
    optIn,
    setSelectedProviderId,
    setSelectedModel,
    refreshConversations,
    openConversation,
    newConversation,
    deleteConversation,
    send,
    cancel,
    canResend,
    resend,
    applyProposal,
    rejectProposal,
  };
}
