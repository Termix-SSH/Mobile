import axios, {
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export interface SeenRequest {
  method: string;
  url: string;
  headers: Record<string, unknown>;
  data: unknown;
  params?: Record<string, unknown>;
}

type Reply =
  | {
      status?: number;
      data?: unknown;
      headers?: Record<string, string>;
      /** Where the request ended up after redirects. */
      responseURL?: string;
    }
  | Error;
type Handler = (req: SeenRequest) => Reply | Promise<Reply>;

/** Routes every axios request in the test through `handler`. */
export function fakeServer(handler: Handler) {
  const seen: SeenRequest[] = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const url = `${config.baseURL ?? ""}${config.url ?? ""}`;
    const req: SeenRequest = {
      method: (config.method ?? "get").toUpperCase(),
      url,
      headers: { ...(config.headers as object) },
      data:
        typeof config.data === "string" ? JSON.parse(config.data) : config.data,
      params: config.params,
    };
    seen.push(req);
    const reply = await handler(req);
    if (reply instanceof Error) throw reply;
    const status = reply.status ?? 200;
    const response = {
      data: reply.data,
      status,
      statusText: String(status),
      headers: reply.headers ?? {},
      config,
      request: { responseURL: reply.responseURL ?? url },
    };
    if (status >= 400) {
      throw new axios.AxiosError(
        `HTTP ${status}`,
        "ERR_BAD_RESPONSE",
        config,
        response.request,
        response,
      );
    }
    return response;
  };
  axios.defaults.adapter = adapter;
  return seen;
}

export async function resetStorage() {
  await AsyncStorage.clear();
  (SecureStore as unknown as { __reset(): void }).__reset();
}
