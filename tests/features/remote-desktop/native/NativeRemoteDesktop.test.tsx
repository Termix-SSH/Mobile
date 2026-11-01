import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { NativeRemoteDesktop } from "@/features/remote-desktop/native/NativeRemoteDesktop";
import { SshError } from "@/modules/termix-ssh";
import { View } from "react-native";
import { ConfirmProvider } from "@/ui";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
  useUiColors: () => ({}),
  useTheme: () => ({ isDark: true }),
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// A plain view in place of the native display, so the test can reach its props.
const mockDisplayView = (props: object) => <View testID="display" {...props} />;
jest.mock("@/modules/termix-display", () => ({
  TermixDisplayView: (props: object) => mockDisplayView(props),
}));
const mockCredential = jest.fn(
  async (..._args: any[]): Promise<any> => null as unknown,
);
const mockPrefs = new Map<string, string>();
jest.mock("@/core/data/hooks", () => ({
  useSessionRepositories: () => ({
    credentials: { get: (id: number) => mockCredential(id) },
    hostPrefs: {
      get: async (_host: unknown, key: string) => mockPrefs.get(key) ?? null,
      set: async (_host: unknown, key: string, value: string) => {
        mockPrefs.set(key, value);
      },
    },
  }),
}));

const flush = () => act(async () => {});

function fakeDisplay() {
  return {
    frameId: "frame-1",
    pointer: jest.fn(),
    keySym: jest.fn(),
    type: jest.fn(),
    clipboard: jest.fn(),
    resize: jest.fn(),
    refresh: jest.fn(),
    close: jest.fn(),
  };
}

async function setup(
  host: Record<string, unknown>,
  open: jest.Mock,
  protocol: "rdp" | "vnc" = "rdp",
) {
  const transport = { kind: "local", provides: ["tcp"], openDisplay: open };
  const onStatus = jest.fn();
  const onUseServer = jest.fn();
  await render(
    <ConfirmProvider>
      <NativeRemoteDesktop
        host={
          {
            id: 7,
            name: "PC",
            ip: "pc.lan",
            port: 22,
            username: "u",
            authType: "password",
            ...host,
          } as never
        }
        protocol={protocol}
        transport={transport as never}
        isVisible
        title="PC"
        onStatus={onStatus}
        onUseServer={onUseServer}
      />
    </ConfirmProvider>,
  );
  await fireEvent(screen.getByTestId("native-remote-desktop"), "layout", {
    nativeEvent: { layout: { width: 400, height: 744 } },
  });
  return { onStatus, onUseServer };
}

beforeEach(() => {
  mockCredential.mockClear();
  mockPrefs.clear();
});

test("connects from the phone with the host's login and the view's size", async () => {
  const display = fakeDisplay();
  const open = jest.fn(async (..._args: any[]): Promise<any> => ({
    display,
    close: jest.fn(),
  }));
  const { onStatus } = await setup(
    { rdpUser: "admin", rdpPassword: "pw", rdpPort: 3390 },
    open,
  );
  await flush();
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({ id: 7, ip: "pc.lan" }),
    expect.objectContaining({
      protocol: "rdp",
      port: 3390,
      username: "admin",
      password: "pw",
      width: expect.any(Number),
    }),
    expect.anything(),
  );
  expect(onStatus).toHaveBeenLastCalledWith({ state: "connected" });
});

test("a host set to ask shows the sign-in first and uses what was typed", async () => {
  const open = jest.fn(async (..._args: any[]): Promise<any> => ({
    display: fakeDisplay(),
    close: jest.fn(),
  }));
  await setup({ rdpAuthType: "none", rdpDomain: "CORP" }, open);
  await flush();
  expect(open).not.toHaveBeenCalled();
  expect(screen.getByText("RDP sign-in")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Username"), "me");
  await fireEvent.changeText(screen.getByLabelText("Password"), "secret");
  await fireEvent.press(screen.getByText("Connect"));
  await flush();
  expect(open.mock.calls[0][1]).toMatchObject({
    username: "me",
    password: "secret",
    domain: "CORP",
  });
});

test("a refused login asks again instead of failing", async () => {
  const open = jest.fn(async (..._args: any[]): Promise<any> => {
    throw new SshError("auth", "The RDP server refused the login");
  });
  await setup({ rdpUser: "admin", rdpPassword: "old" }, open);
  await flush();
  expect(screen.getByText("RDP sign-in")).toBeTruthy();
  expect(screen.getByText(/That login was refused/)).toBeTruthy();
});

test("an unreachable host offers the server", async () => {
  const open = jest.fn(async (..._args: any[]): Promise<any> => {
    throw new SshError("connect", "Connection refused");
  });
  const { onUseServer } = await setup({ rdpUser: "a", rdpPassword: "b" }, open);
  await flush();
  expect(screen.getByText("Connection Failed")).toBeTruthy();
  await fireEvent.press(screen.getByText("Connect through the server"));
  expect(onUseServer).toHaveBeenCalled();
});

test("uses the linked login when the host points to one", async () => {
  mockCredential.mockResolvedValueOnce({ username: "cred", password: "x" });
  const open = jest.fn(async (..._args: any[]): Promise<any> => ({
    display: fakeDisplay(),
    close: jest.fn(),
  }));
  await setup({ protocolAuth: { rdp: { credentialId: 5 } } }, open);
  await flush();
  expect(mockCredential).toHaveBeenCalledWith(5);
  expect(open.mock.calls[0][1]).toMatchObject({
    username: "cred",
    password: "x",
  });
});

test("a new RDP certificate is asked about before any login is sent, then trusted", async () => {
  const display = fakeDisplay();
  const fp = "AB:CD:EF";
  const open = jest
    .fn(async (..._args: any[]): Promise<any> => ({
      display,
      close: jest.fn(),
    }))
    .mockRejectedValueOnce(
      new SshError("connect", `Could not connect: RDP_CERT_NEW ${fp}`),
    );
  await setup({ rdpPassword: "pw", rdpUser: "me" }, open);
  await flush();
  expect(open.mock.calls[0][1].serverCert).toBeNull();
  expect(screen.getByText("Trust this computer?")).toBeTruthy();
  await fireEvent.press(screen.getByText("Trust and connect"));
  await flush();
  expect(mockPrefs.get("rdpCert")).toBe(fp);
  expect(open).toHaveBeenCalledTimes(2);
  expect(open.mock.calls[1][1].serverCert).toBe(fp);
});

test("a changed certificate that is not trusted stops with a message", async () => {
  mockPrefs.set("rdpCert", "OLD");
  const open = jest.fn(async (..._args: any[]): Promise<any> => {
    throw new SshError("connect", "RDP_CERT_CHANGED 11:22");
  });
  await setup({ rdpPassword: "pw", rdpUser: "me" }, open);
  await flush();
  expect(open.mock.calls[0][1].serverCert).toBe("OLD");
  expect(screen.getByText("Certificate changed")).toBeTruthy();
  await fireEvent.press(screen.getByText("Cancel"));
  await flush();
  expect(
    screen.getByText("The computer's certificate was not trusted."),
  ).toBeTruthy();
  expect(mockPrefs.get("rdpCert")).toBe("OLD");
});

test("vnc asks the server for the view's size once it sent its own", async () => {
  const display = fakeDisplay();
  let callbacks: { onResize: (w: number, h: number) => void } | undefined;
  const open = jest.fn(async (...args: any[]): Promise<any> => {
    callbacks = args[2];
    return { display, close: jest.fn() };
  });
  await setup({ vncPassword: "pw" }, open, "vnc");
  await flush();
  expect(display.resize).not.toHaveBeenCalled();
  await act(async () => callbacks!.onResize(1920, 1080));
  await act(() => new Promise((r) => setTimeout(r, 450)));
  expect(display.resize).toHaveBeenCalledTimes(1);
  const [w, h] = display.resize.mock.calls[0];
  expect(w).toBe(400);
  expect(h).toBeLessThan(744);
});

test("a trackpad or mouse on the display drives the remote pointer", async () => {
  const display = fakeDisplay();
  let callbacks: { onResize: (w: number, h: number) => void } | undefined;
  const open = jest.fn(async (...args: any[]): Promise<any> => {
    callbacks = args[2];
    return { display, close: jest.fn() };
  });
  await setup({ rdpUser: "admin", rdpPassword: "pw" }, open);
  await flush();
  await act(async () => callbacks!.onResize(2000, 1000));
  const view = screen.getByTestId("display");
  // The area around the display: 1000x500 shows the 2000x1000 desktop at half size.
  let area = view.parent;
  while (area && !area.props.onLayout) area = area.parent;
  await fireEvent(area!, "layout", {
    nativeEvent: { layout: { width: 1000, height: 500 } },
  });
  // Touches go to the display itself, next to its pointer recognizers.
  expect(view.props.onStartShouldSetResponder).toEqual(expect.any(Function));

  await fireEvent(view, "pointer", {
    nativeEvent: { kind: "hover", x: 100, y: 50, buttons: 0, dy: 0 },
  });
  await fireEvent(view, "pointer", {
    nativeEvent: { kind: "down", x: 100, y: 50, buttons: 4, dy: 0 },
  });
  expect(display.pointer.mock.calls).toEqual([
    [200, 100, 0],
    [200, 100, 4],
  ]);
});
