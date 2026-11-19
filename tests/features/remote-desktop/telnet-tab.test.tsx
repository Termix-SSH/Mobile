import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("@/features/terminal/Terminal", () => {
  const { forwardRef } = jest.requireActual("react");
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    Terminal: forwardRef((props: any, _ref: unknown) => (
      <Pressable onPress={props.onUseServer}>
        <Text>phone terminal</Text>
      </Pressable>
    )),
  };
});
jest.mock("@/features/remote-desktop/RemoteDesktop", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    RemoteDesktop: (props: any) => (
      <Text>{`server view ${props.protocol} host ${props.host.id}`}</Text>
    ),
  };
});
jest.mock("@/features/remote-desktop/route", () => ({
  useRemoteRoute: (host: any, _p: string, _n: unknown, origin: string) => ({
    route: origin === "server" ? { via: "server", host } : { via: "checking" },
    switchTo: jest.fn(),
  }),
}));
jest.mock("@/features/remote-desktop/native/NativeRemoteDesktop", () => ({
  NativeRemoteDesktop: () => null,
}));
jest.mock("@/modules/termix-ssh", () => ({ displayProtocols: () => [] }));
jest.mock("@/features/terminal/keys/KeyRowBar", () => () => null);
jest.mock("@/features/terminal/keyboard/BottomToolbar", () => () => null);
jest.mock("@/screens/sessions/shared/ConnectionError", () => ({
  ConnectionError: () => null,
}));

// eslint-disable-next-line import/first
import { telnetFeature } from "@/features/remote-desktop/register";

test("the Telnet tab moves to the server's view when the phone gives up", async () => {
  const TelnetTab = telnetFeature.sessionTabs![0].component as any;
  const session = {
    type: "telnet",
    title: "Switch",
    instanceId: "t1",
    host: {
      id: 7,
      name: "Switch",
      ip: "10.0.0.5",
      port: 22,
      username: "admin",
      authType: "password",
      enableTelnet: true,
    },
  };
  await render(
    <TelnetTab
      session={session}
      isVisible
      onClose={() => {}}
      onBackendSessionId={() => {}}
    />,
  );
  expect(screen.getByText("phone terminal")).toBeTruthy();
  await fireEvent.press(screen.getByText("phone terminal"));
  expect(screen.getByText("server view telnet host 7")).toBeTruthy();
  expect(screen.queryByText("phone terminal")).toBeNull();
});
