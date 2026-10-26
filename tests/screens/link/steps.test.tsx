import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { AccountClient } from "@/core/api/AccountClient";
import type { ServerSignIn } from "@/core/accounts/link/methods";
import { SignInStep, splitOptions } from "@/screens/link/SignInStep";
import { MergeStep, SecondFactorStep } from "@/screens/link/SmallSteps";
import { describeCounts } from "@/core/sync";
import { saveLogin } from "@/core/accounts/saved-login";
import { accountStorage } from "@/core/storage/kv";

jest.mock("expo-local-authentication", () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
  supportedAuthenticationTypesAsync: jest.fn(async () => [2]),
}));

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
}));

const signIn: ServerSignIn = {
  reachable: true,
  proxyGate: false,
  setupRequired: false,
  registrationAllowed: true,
  rememberDevice: true,
  options: [
    { kind: "password" },
    { kind: "form", methodId: "ldap", instanceId: "1", label: "Corp LDAP" },
    { kind: "redirect", methodId: "oidc", instanceId: "g", label: "Google" },
    { kind: "redirect", methodId: "oidc", instanceId: "k", label: "Keycloak" },
    { kind: "browser" },
  ],
};

const client = {} as AccountClient;

test("options split into forms, providers and the browser", () => {
  const split = splitOptions(signIn.options);
  expect(split.forms).toHaveLength(2);
  expect(split.redirects.map((r) => r.label)).toEqual(["Google", "Keycloak"]);
  expect(split.browser).toBe(true);
});

test("every sign in the server lists gets a way in", async () => {
  const onRedirect = jest.fn();
  const onBrowser = jest.fn();
  const onSignup = jest.fn();
  await render(
    <SignInStep
      client={client}
      signIn={signIn}
      onResult={jest.fn()}
      onRedirect={onRedirect}
      onBrowser={onBrowser}
      onSignup={onSignup}
      onReset={jest.fn()}
    />,
  );
  expect(screen.getAllByText("Password").length).toBeGreaterThan(0);
  expect(screen.getByText("Corp LDAP")).toBeTruthy();
  await fireEvent.press(screen.getByText("Continue with Keycloak"));
  expect(onRedirect).toHaveBeenCalledWith(
    expect.objectContaining({ instanceId: "k" }),
  );
  await fireEvent.press(screen.getByText("Sign in in the browser"));
  expect(onBrowser).toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Make an account"));
  expect(onSignup).toHaveBeenCalled();
});

test("a server with passkeys gets its own passkey button", async () => {
  const onBrowser = jest.fn();
  await render(
    <SignInStep
      client={client}
      signIn={{
        ...signIn,
        options: [{ kind: "password" }, { kind: "browser", passkey: true }],
      }}
      onResult={jest.fn()}
      onRedirect={jest.fn()}
      onBrowser={onBrowser}
      onSignup={jest.fn()}
      onReset={jest.fn()}
    />,
  );
  expect(screen.queryByText("Sign in in the browser")).toBeNull();
  await fireEvent.press(
    screen.getByText("Sign in with a passkey or security key"),
  );
  expect(onBrowser).toHaveBeenCalled();
});

test("a provider set to start on its own opens right away", async () => {
  const onRedirect = jest.fn();
  await render(
    <SignInStep
      client={client}
      signIn={{
        ...signIn,
        options: [
          {
            kind: "redirect",
            methodId: "oidc",
            label: "Okta",
            autoStart: true,
          },
          { kind: "browser" },
        ],
      }}
      onResult={jest.fn()}
      onRedirect={onRedirect}
      onBrowser={jest.fn()}
      onSignup={jest.fn()}
      onReset={jest.fn()}
    />,
  );
  expect(onRedirect).toHaveBeenCalledWith(
    expect.objectContaining({ label: "Okta" }),
  );
});

test("a security key second factor points to the browser", async () => {
  const onBrowser = jest.fn();
  await render(
    <SecondFactorStep
      client={client}
      step={{ tempToken: "t", factors: ["security-key"] }}
      onResult={jest.fn()}
      onBrowser={onBrowser}
      onBack={jest.fn()}
    />,
  );
  expect(screen.queryByText("Check code")).toBeNull();
  await fireEvent.press(screen.getByText("Use a security key in the browser"));
  expect(onBrowser).toHaveBeenCalled();
});

test("the merge summary counts what this phone has", async () => {
  expect(
    describeCounts({ hosts: 12, logins: 1, snippets: 0, folders: 2 }),
  ).toBe("12 hosts, 1 credential and 2 folders");
  expect(describeCounts({ hosts: 0, logins: 0, snippets: 0, folders: 0 })).toBe(
    "nothing yet",
  );
  const onChoose = jest.fn();
  await render(
    <MergeStep
      counts={{ hosts: 3, logins: 0, snippets: 1, folders: 0 }}
      serverName="home.lan"
      onChoose={onChoose}
    />,
  );
  expect(
    screen.getByText(
      "This phone has 3 hosts and 1 snippet. They stay on This device either way.",
    ),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText("Replace"));
  expect(onChoose).toHaveBeenCalledWith(false);
});

test("a saved login signs in with Face ID", async () => {
  const loginUser = jest.fn(async () => ({}));
  const saved = {
    accountId: "s9",
    storage: accountStorage("s9"),
    api: { auth: { loginUser } },
    token: () => "T".repeat(30),
  } as unknown as AccountClient;
  await saveLogin(saved, { username: "luke", password: "pw" });
  const onResult = jest.fn();
  await render(
    <SignInStep
      client={saved}
      signIn={signIn}
      onResult={onResult}
      onRedirect={jest.fn()}
      onBrowser={jest.fn()}
      onSignup={jest.fn()}
      onReset={jest.fn()}
    />,
  );
  await fireEvent.press(await screen.findByText("Sign in with Face ID"));
  await waitFor(() =>
    expect(onResult).toHaveBeenCalledWith({ kind: "signedIn" }),
  );
  expect(loginUser).toHaveBeenCalledWith("luke", "pw");
});
