import {
  execLine,
  openLocalConsole,
  openRelayConsole,
} from "@/features/docker/consoleLink";
import { FakeSocket, flush, useFakeWebSocket } from "../../helpers/socket";

function events() {
  return {
    onOutput: jest.fn(),
    onConnected: jest.fn(),
    onError: jest.fn(),
    onClosed: jest.fn(),
  };
}

test("the exec line picks bash or sh and refuses odd ids", () => {
  expect(execLine("docker", "abc123", true)).toBe(
    "clear; exec sudo docker exec -it abc123 sh -c 'command -v bash >/dev/null 2>&1 && exec bash || exec sh'\n",
  );
  expect(execLine("podman", "web_1", false)).toContain("podman");
  expect(() => execLine("docker", "x; rm -rf /", false)).toThrow(
    "not a valid container id",
  );
});

describe("on the phone", () => {
  function runner() {
    let handlers: any;
    const shell = {
      write: jest.fn(async (_text: string) => {}),
      resize: jest.fn(async () => {}),
      close: jest.fn(async () => {}),
    };
    const r = {
      shell: jest.fn(async (h: any) => {
        handlers = h;
        return shell;
      }),
    };
    return { r, shell, handlers: () => handlers };
  }

  test("starts the container shell and joins split UTF-8 output", async () => {
    const { r, shell, handlers } = runner();
    const ev = events();
    const link = openLocalConsole(
      { runner: r as any, runtime: "docker", sudo: false },
      "abc",
      { cols: 80, rows: 24 },
      ev,
    );
    await flush();
    expect(shell.write.mock.calls[0][0]).toMatch(/exec -it abc/);
    expect(ev.onConnected).toHaveBeenCalled();
    const bytes = new TextEncoder().encode("é");
    handlers().onData(bytes.subarray(0, 1));
    handlers().onData(bytes.subarray(1));
    expect(ev.onOutput.mock.calls.map((c) => c[0]).join("")).toBe("é");
    link.input("ls\n");
    link.resize(100, 30);
    expect(shell.resize).toHaveBeenCalledWith(100, 30);
    handlers().onExit();
    expect(ev.onClosed).toHaveBeenCalledTimes(1);
  });

  test("closing before the shell opens closes it at once", async () => {
    const { r, shell } = runner();
    const link = openLocalConsole(
      { runner: r as any, runtime: "docker", sudo: false },
      "abc",
      { cols: 80, rows: 24 },
      events(),
    );
    link.close();
    await flush();
    expect(shell.close).toHaveBeenCalled();
    expect(shell.write).not.toHaveBeenCalled();
  });

  test("a failed shell says why", async () => {
    const ev = events();
    openLocalConsole(
      {
        runner: {
          shell: async () => Promise.reject(new Error("no pty")),
        } as any,
        runtime: "docker",
        sudo: false,
      },
      "abc",
      { cols: 80, rows: 24 },
      ev,
    );
    await flush();
    expect(ev.onError).toHaveBeenCalledWith("no pty");
  });
});

describe("through the server", () => {
  useFakeWebSocket();

  function relayClient(token: string | null = "jwt") {
    const sockets: FakeSocket[] = [];
    const c: any = {
      token: async () => token,
      dockerConsoleWebSocketUrl: (t: string) => `wss://t/docker?token=${t}`,
      openSocket: (url: string, protocols: string[]) => {
        const s = new FakeSocket(url, protocols);
        sockets.push(s);
        return s;
      },
    };
    return { c, sockets };
  }

  test("connects with the host, streams output and resizes", async () => {
    const { c, sockets } = relayClient();
    const ev = events();
    const link = openRelayConsole(
      c,
      { id: 3, ip: "10.0.0.3", syncId: "s3" } as any,
      "abc",
      () => ({ cols: 80, rows: 24 }),
      ev,
    );
    await flush();
    const ws = sockets[0];
    ws.open();
    expect(ws.sent[0]).toMatchObject({
      type: "connect",
      data: {
        hostConfig: { id: 3, syncId: "s3", enableDocker: true },
        containerId: "abc",
        cols: 80,
      },
    });
    ws.message({ type: "connected" });
    expect(ev.onConnected).toHaveBeenCalled();
    expect(ws.sent[1]).toEqual({
      type: "resize",
      data: { cols: 80, rows: 24 },
    });
    ws.message({ type: "output", data: "hi" });
    expect(ev.onOutput).toHaveBeenCalledWith("hi");
    link.input("x");
    expect(ws.sent.at(-1)).toEqual({ type: "input", data: "x" });
    link.close();
    expect(ws.sent.at(-1)).toEqual({ type: "disconnect" });
    ws.onclose?.();
    expect(ev.onClosed).not.toHaveBeenCalled();
  });

  test("an error is reported once, not as a close", async () => {
    const { c, sockets } = relayClient();
    const ev = events();
    openRelayConsole(
      c,
      { id: 3 } as any,
      "abc",
      () => ({ cols: 1, rows: 1 }),
      ev,
    );
    await flush();
    sockets[0].open();
    sockets[0].message({ type: "error", message: "no such container" });
    sockets[0].onclose?.();
    expect(ev.onError).toHaveBeenCalledWith("no such container");
    expect(ev.onClosed).not.toHaveBeenCalled();
  });

  test("no session says so", async () => {
    const { c, sockets } = relayClient(null);
    const ev = events();
    openRelayConsole(
      c,
      { id: 3 } as any,
      "abc",
      () => ({ cols: 1, rows: 1 }),
      ev,
    );
    await flush();
    expect(sockets).toHaveLength(0);
    expect(ev.onError).toHaveBeenCalledWith("Not authenticated");
  });
});
