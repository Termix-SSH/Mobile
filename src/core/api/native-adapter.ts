import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { fromBase64, toBase64, utf8Decode } from "@/core/db/bytes";
import {
  nativeRequest,
  nativeStream,
  type NetRequest,
  type NetResponse,
} from "@/modules/termix-net";

function bodyOf(data: unknown): Pick<NetRequest, "body" | "bodyBase64"> {
  if (data == null) return { body: null };
  if (typeof data === "string") return { body: data };
  if (data instanceof ArrayBuffer) {
    return { bodyBase64: toBase64(new Uint8Array(data)) };
  }
  if (ArrayBuffer.isView(data)) {
    return {
      bodyBase64: toBase64(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      ),
    };
  }
  if (typeof FormData !== "undefined" && data instanceof FormData) {
    throw new AxiosError(
      "This request can't go through a client certificate connection yet.",
      "ERR_NOT_SUPPORT",
    );
  }
  return { body: JSON.stringify(data) };
}

function flatHeaders(
  config: InternalAxiosRequestConfig,
): Record<string, string> {
  const out: Record<string, string> = {};
  const json = AxiosHeaders.from(config.headers).toJSON();
  for (const [name, value] of Object.entries(json)) {
    if (value === undefined || value === null) continue;
    out[name] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

/**
 * Sends axios requests through the termix-net module, which presents the
 * account's client certificate. Only used on iOS, where React Native's own
 * networking can't.
 */
export const nativeAdapter: AxiosAdapter = async (config) => {
  const url = axios.getUri(config);
  let response: NetResponse;
  try {
    response = await nativeRequest({
      url,
      method: (config.method ?? "get").toUpperCase(),
      headers: flatHeaders(config),
      ...bodyOf(config.data),
      timeoutMs: config.timeout || 30000,
    });
  } catch (error) {
    if (error instanceof AxiosError) throw error;
    throw new AxiosError(
      error instanceof Error ? error.message : "Network Error",
      AxiosError.ERR_NETWORK,
      config,
    );
  }
  const result: AxiosResponse = {
    data: response.body,
    status: response.status,
    statusText: "",
    headers: new AxiosHeaders(response.headers),
    config,
    request: { responseURL: response.url },
  };
  const valid = config.validateStatus ?? ((s: number) => s >= 200 && s < 300);
  if (!response.status || valid(response.status)) return result;
  throw new AxiosError(
    `Request failed with status code ${response.status}`,
    response.status >= 500
      ? AxiosError.ERR_BAD_RESPONSE
      : AxiosError.ERR_BAD_REQUEST,
    config,
    result.request,
    result,
  );
};

/**
 * A streamed fetch Response over the native module, for file downloads with a
 * client certificate on iOS. Resolves once the headers are in; the body is
 * read with getReader() like expo/fetch.
 */
export function nativeStreamResponse(
  request: NetRequest,
  signal?: AbortSignal,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const queue: Uint8Array[] = [];
    let ended = false;
    let failure: Error | null = null;
    let wake: (() => void) | null = null;
    const notify = () => {
      wake?.();
      wake = null;
    };
    let answered = false;
    const stop = nativeStream(
      { ...request, binary: true },
      {
        onResponse(status, headers) {
          answered = true;
          resolve(streamedResponse(status, headers, reader, request.url));
        },
        onData(chunk) {
          queue.push(fromBase64(chunk));
          notify();
        },
        onEnd(error) {
          ended = true;
          if (error) failure = new Error(error);
          if (!answered) reject(failure ?? new Error("No answer"));
          notify();
        },
      },
    );
    signal?.addEventListener("abort", () => {
      stop();
      ended = true;
      failure = new Error("Cancelled");
      if (!answered) reject(failure);
      notify();
    });
    const reader = {
      async read(): Promise<ReadableStreamReadResult<Uint8Array>> {
        while (!queue.length && !ended) {
          await new Promise<void>((r) => (wake = r));
        }
        if (queue.length) return { done: false, value: queue.shift()! };
        if (failure) throw failure;
        return { done: true, value: undefined };
      },
      async cancel() {
        stop();
        ended = true;
        notify();
      },
    };
  });
}

function streamedResponse(
  status: number,
  headers: Record<string, string>,
  reader: {
    read(): Promise<ReadableStreamReadResult<Uint8Array>>;
    cancel(): Promise<void>;
  },
  url: string,
): Response {
  const text = async () => {
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) {
      all.set(part, at);
      at += part.length;
    }
    return utf8Decode(all);
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    url,
    headers: new Headers(headers),
    redirected: false,
    type: "basic",
    bodyUsed: false,
    body: { getReader: () => reader },
    text,
    json: async () => JSON.parse(await text()),
  } as unknown as Response;
}

/** A fetch Response built from a native response, for code that uses fetch. */
export function toFetchResponse(response: NetResponse): Response {
  const headers = new Headers(response.headers);
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: "",
    url: response.url,
    headers,
    redirected: false,
    type: "basic",
    bodyUsed: false,
    body: null,
    text: async () => response.body,
    json: async () => JSON.parse(response.body),
    clone() {
      return toFetchResponse(response);
    },
  } as unknown as Response;
}
