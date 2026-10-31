import { render } from "@testing-library/react-native";
import { RelayConnector } from "@/features/file-manager/connection/RelayConnector";

let mockSynced = true;
jest.mock("@/core/sync", () => ({
  isSynced: () => mockSynced,
}));
const mockConnectSSH = jest.fn(async () => ({}));
jest.mock("@/core/accounts/session", () => ({
  useSessionClient: () => ({
    accountId: "s",
    api: { files: { connectSSH: mockConnectSSH } },
  }),
}));
let mockTransport: any;
jest.mock("@/screens/sessions/shared", () => ({
  AuthDialogs: () => null,
  useSessionConnect: (_host: unknown, transport: unknown) => {
    mockTransport = transport;
    return { state: "connecting", logEntries: [] };
  },
}));

const host = {
  id: 99,
  syncId: "abc",
  ip: "10.0.0.2",
  port: 22,
  username: "u",
  authType: "password",
  password: "from-phone",
  keyPassword: "phrase",
  credentialId: 3,
  jumpHosts: [{ hostId: 7 }],
} as any;

async function connect(overrides = {}) {
  await render(
    <RelayConnector host={host} onReady={jest.fn()} onStatus={jest.fn()} />,
  );
  await mockTransport.connect("sid", host, "user", overrides);
  return (mockConnectSSH.mock.calls.at(-1) as unknown[])[1];
}

beforeEach(() => mockConnectSSH.mockClear());

test("a synced host lets the server use its own login, jump hosts and proxy", async () => {
  mockSynced = true;
  const body = await connect();
  expect(body).toMatchObject({ hostId: 99, syncId: "abc" });
  expect(body).toMatchObject({
    password: undefined,
    sshKey: undefined,
    keyPassword: undefined,
    credentialId: undefined,
    jumpHosts: undefined,
  });
});

test("a password typed into the login dialog still goes through", async () => {
  mockSynced = true;
  const body = await connect({ userProvidedPassword: "typed" });
  expect(body).toMatchObject({ password: "typed", syncId: "abc" });
});

test("a live server's host sends what it has, as before", async () => {
  mockSynced = false;
  const body = await connect();
  expect(body).toMatchObject({
    syncId: undefined,
    password: "from-phone",
    keyPassword: "phrase",
    credentialId: 3,
    jumpHosts: [{ hostId: 7 }],
  });
});
