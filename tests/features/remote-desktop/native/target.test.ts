import {
  displayCredentialId,
  displayLogin,
  displayTarget,
} from "@/features/remote-desktop/native/target";

const host = (over: Record<string, unknown> = {}) =>
  ({
    id: 1,
    ip: "pc.lan",
    rdpUser: "admin",
    rdpPassword: "pw",
    rdpDomain: "CORP",
    vncPassword: "vnc",
    ...over,
  }) as never;

test("finds the linked login, a personal override winning", () => {
  expect(displayCredentialId(host(), "rdp")).toBeNull();
  expect(
    displayCredentialId(
      host({ protocolAuth: { vnc: { credentialId: 4 } } }),
      "vnc",
    ),
  ).toBe(4);
  expect(
    displayCredentialId(
      host({
        protocolAuth: { rdp: { credentialId: 4 } },
        authOverrides: { rdp: { credentialId: "9" } },
      }),
      "rdp",
    ),
  ).toBe(9);
});

test("uses the host's own login, or the linked credential", () => {
  expect(displayLogin(host(), "rdp", null)).toEqual({
    username: "admin",
    password: "pw",
    domain: "CORP",
    prompt: false,
  });
  expect(displayLogin(host(), "vnc", null)).toEqual({
    username: undefined,
    password: "vnc",
    prompt: false,
  });
  expect(
    displayLogin(host(), "rdp", { username: "u", password: "p" } as never),
  ).toMatchObject({ username: "u", password: "p", domain: "CORP" });
});

test("RDP hosts set to ask prompt", () => {
  expect(displayLogin(host({ rdpAuthType: "none" }), "rdp", null).prompt).toBe(
    true,
  );
});

test("RDP asks for the screen in pixels with the matching scale", () => {
  const t = displayTarget(
    host({ rdpPort: 3390 }),
    "rdp",
    { prompt: false, username: "a" },
    400,
    700,
    2,
  );
  expect(t).toMatchObject({
    protocol: "rdp",
    port: 3390,
    username: "a",
    width: 800,
    height: 1400,
    scale: 200,
    security: "",
  });
  const fixed = displayTarget(
    host({
      guacamoleConfig: { width: 1920, height: 1080 },
      rdpSecurity: "nla",
    }),
    "rdp",
    { prompt: false },
    400,
    700,
    2,
  );
  expect(fixed).toMatchObject({
    width: 1920,
    height: 1080,
    scale: 0,
    security: "nla",
  });
});

test("VNC uses its own port and never sends a domain or scale", () => {
  const t = displayTarget(
    host(),
    "vnc",
    { prompt: false, domain: "X" },
    400,
    700,
    3,
  );
  expect(t).toMatchObject({
    port: 5900,
    domain: undefined,
    scale: 0,
    width: 400,
  });
});
