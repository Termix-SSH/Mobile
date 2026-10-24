import axios from "axios";
import type { AccountClient } from "../AccountClient";
import { isHtmlPayload, USER_AGENT } from "../http";
import {
  accessFromHttpError,
  accessFromStatus,
  type AiAccess,
} from "@/features/ai/access";
import { readSseStream } from "@/features/ai/sse";
import {
  parseConversationDetail,
  parseConversations,
  parseProviders,
  parseStatus,
  type AiStreamEvent,
} from "@/features/ai/types";

export class AiApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AiApiError";
  }
}

function serverMessage(data: unknown): string | undefined {
  return typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string" &&
    data.error.trim()
    ? data.error
    : undefined;
}

export function createAiApi(
  c: AccountClient,
  deps: { fetch?: typeof fetch } = {},
) {
  const basePath = "/plugin-api/ai";

  function isAiAvailable(): boolean {
    return c.supports({ plugin: "ai", pluginApiOnly: true });
  }

  function apiError(error: unknown): AiApiError {
    if (error instanceof AiApiError) return error;
    const response = axios.isAxiosError(error) ? error.response : undefined;
    if (response?.status === 401) c.notifyAuthLost();
    return new AiApiError(
      serverMessage(response?.data) ??
        (error instanceof Error ? error.message : "AI request failed"),
      response?.status,
    );
  }

  async function getAccess(): Promise<AiAccess> {
    if (!isAiAvailable()) return { state: "not-installed" };
    try {
      const response = await c.http.auth.get(`${basePath}/status`, {
        baseURL: c.rootBase(),
      });
      if (isHtmlPayload(response.data)) return { state: "not-installed" };
      return accessFromStatus(parseStatus(response.data));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        if (error.response.status === 401) c.notifyAuthLost();
        return accessFromHttpError(error.response.status, error.response.data);
      }
      return accessFromHttpError(undefined, {
        error: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function optIn(enabled: boolean): Promise<AiAccess> {
    try {
      await c.http.auth.put(
        `${basePath}/opt-in`,
        { enabled },
        {
          baseURL: c.rootBase(),
        },
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        return getAccess();
      }
      throw apiError(error);
    }
    return getAccess();
  }

  async function request(
    method: "get" | "delete" | "post",
    path: string,
    timeout?: number,
  ): Promise<unknown> {
    try {
      const response = await c.http.auth.request({
        method,
        url: `${basePath}${path}`,
        baseURL: c.rootBase(),
        ...(timeout !== undefined ? { timeout } : {}),
      });
      return response.data;
    } catch (error) {
      throw apiError(error);
    }
  }

  function parsed<T>(parse: (data: unknown) => T | null, data: unknown): T {
    const result = parse(data);
    if (result === null) throw new AiApiError("Unexpected response");
    return result;
  }

  async function listProviders() {
    return parsed(parseProviders, await request("get", "/providers"));
  }

  async function listConversations() {
    return parsed(parseConversations, await request("get", "/conversations"));
  }

  async function getConversation(id: string | number) {
    return parsed(
      parseConversationDetail,
      await request("get", `/conversations/${encodeURIComponent(id)}`),
    );
  }

  async function deleteConversation(id: string | number): Promise<void> {
    await request("delete", `/conversations/${encodeURIComponent(id)}`);
  }

  async function applyProposal(
    id: string | number,
  ): Promise<{ success: boolean; summary: string }> {
    const data = await request(
      "post",
      `/proposals/${encodeURIComponent(id)}/apply`,
      120000,
    );
    if (
      typeof data !== "object" ||
      data === null ||
      !("success" in data) ||
      typeof data.success !== "boolean" ||
      !("summary" in data) ||
      typeof data.summary !== "string"
    ) {
      throw new AiApiError("Unexpected response");
    }
    return { success: data.success, summary: data.summary };
  }

  async function rejectProposal(id: string | number): Promise<void> {
    await request("post", `/proposals/${encodeURIComponent(id)}/reject`);
  }

  async function streamChat(
    input: {
      conversationId?: string;
      providerId: string;
      model?: string;
      message: string;
    },
    onEvent: (event: AiStreamEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    // Keep Expo's native fetch out of Jest unless a caller actually needs it.

    const fetchStream =
      deps.fetch ?? (require("expo/fetch").fetch as typeof fetch);
    const response = await fetchStream(
      `${c.rootBase()}${basePath}/chat/stream`,
      {
        method: "POST",
        headers: {
          ...c.proxyHeaders(),
          Authorization: `Bearer ${c.token()}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(input),
        signal,
      },
    );
    if (!response.ok) {
      if (response.status === 401) c.notifyAuthLost();
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        // Proxies may answer with a non-JSON error page.
      }
      throw new AiApiError(
        serverMessage(data) ?? `AI request failed (${response.status})`,
        response.status,
      );
    }
    if (
      response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "text/event-stream" ||
      !response.body
    ) {
      throw new AiApiError("Unexpected response");
    }
    await readSseStream(response.body, onEvent, signal);
  }

  return {
    isAiAvailable,
    getAccess,
    optIn,
    listProviders,
    listConversations,
    getConversation,
    deleteConversation,
    applyProposal,
    rejectProposal,
    streamChat,
  };
}

export type AiApi = ReturnType<typeof createAiApi>;
