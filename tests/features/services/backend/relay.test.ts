import { FakeSocket, flush, useFakeWebSocket } from "../../../helpers/socket";
import { createServicesApi } from "@/core/api/modules/services";
import { createRelayServicesBackend } from "@/features/services/backend/relay";

function client() {
  const get = jest.fn(async (path: string, config: any) => ({
    data: path.endsWith("/status")
      ? { init: "systemd", canEdit: false, readOnly: false }
      : path.endsWith("/journal")
        ? { entries: [{ message: "x" }], truncated: false, config }
        : [],
  }));
  const post = jest.fn(
    async (_path: string, _body?: unknown, _config?: unknown) => ({
      data: { state: "active", output: "" },
    }),
  );
  const c: any = {
    http: { auth: { get, post } },
    rootBase: () => "https://t.example",
    fail: (e: unknown) => {
      throw e;
    },
  };
  c.api = { services: createServicesApi(c) };
  return { c, get, post };
}

test("calls the plugin routes by host id", async () => {
  const { c, get, post } = client();
  const backend = createRelayServicesBackend(c, {
    id: 42,
    ip: "1.2.3.4",
  } as any);
  expect(await backend.status()).toMatchObject({
    init: "systemd",
    readOnly: true,
  });
  await backend.units("timer");
  await backend.unit("a@b.service");
  expect(await backend.action("nginx.service", "restart")).toBe("active");
  expect(
    await backend.journal({ units: ["a.service"], priority: 3, lines: 10 }),
  ).toEqual([{ message: "x" }]);
  expect(get.mock.calls.map((x) => x[0])).toEqual([
    "/plugin-api/service-manager/42/status",
    "/plugin-api/service-manager/42/units",
    "/plugin-api/service-manager/42/units/a%40b.service",
    "/plugin-api/service-manager/42/journal",
  ]);
  expect(get.mock.calls[1][1].params).toEqual({ type: "timer" });
  expect(get.mock.calls[3][1].params).toEqual({
    unit: ["a.service"],
    priority: 3,
    lines: 10,
  });
  expect(post.mock.calls[0][0]).toBe(
    "/plugin-api/service-manager/42/units/nginx.service/actions/restart",
  );
});

describe("live follow", () => {
  useFakeWebSocket();

  function followClient(token: string | null = "jwt") {
    const sockets: FakeSocket[] = [];
    const c: any = {
      token: async () => token,
      pluginWebSocketUrl: (id: string, path: string) => `wss://t/${id}/${path}`,
      openSocket: (url: string, protocols: string[]) => {
        const s = new FakeSocket(url, protocols);
        sockets.push(s);
        return s;
      },
      api: { services: {} },
    };
    return { c, sockets };
  }

  test("asks for the journal, passes lines on and ends once", async () => {
    const { c, sockets } = followClient();
    const backend = createRelayServicesBackend(c, {
      id: 4,
      syncId: "s4",
      ip: "10.0.0.4",
    } as any);
    const lines = jest.fn();
    const end = jest.fn();
    backend.follow(
      { units: ["nginx.service"], priority: 3 } as any,
      lines,
      end,
    );
    await flush();
    const ws = sockets[0];
    expect(ws.url).toBe("wss://t/service-manager/follow");
    expect(ws.protocols).toEqual(["termix.jwt.jwt"]);
    ws.open();
    expect(ws.sent[0]).toMatchObject({
      type: "connect",
      data: { hostConfig: { id: 4, syncId: "s4" }, units: ["nginx.service"] },
    });
    ws.message({ type: "lines", data: [{ message: "up" }] });
    ws.message({ type: "lines", data: [] });
    expect(lines).toHaveBeenCalledTimes(1);
    ws.message({ type: "error", message: "no journal" });
    ws.onclose?.();
    expect(end).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith("no journal");
  });

  test("stopping sends disconnect and never reports an end", async () => {
    const { c, sockets } = followClient();
    const backend = createRelayServicesBackend(c, { id: 4 } as any);
    const end = jest.fn();
    const handle = backend.follow({} as any, jest.fn(), end);
    await flush();
    sockets[0].open();
    handle.stop();
    sockets[0].onclose?.();
    expect(sockets[0].sent.at(-1)).toEqual({ type: "disconnect" });
    expect(sockets[0].closed).toBe(true);
    expect(end).not.toHaveBeenCalled();
  });

  test("no session ends with a message and opens nothing", async () => {
    const { c, sockets } = followClient(null);
    const backend = createRelayServicesBackend(c, { id: 4 } as any);
    const end = jest.fn();
    backend.follow({} as any, jest.fn(), end);
    await flush();
    expect(sockets).toHaveLength(0);
    expect(end).toHaveBeenCalledWith("Not signed in");
  });
});
