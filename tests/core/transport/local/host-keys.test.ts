import {
  checkHostKey,
  sha256OfBlob,
  type HostKeyCheck,
} from "@/core/transport/local/host-keys";

const key = {
  host: "box",
  port: 22,
  keyType: "ssh-ed25519",
  blobHex: "abcd",
  sha256: "SHA256:new",
  isCertificate: false,
  caSha256: null,
  principals: [],
};

function repo() {
  return {
    profile: jest.fn(),
    saveHostKey: jest.fn(async () => {}),
    touchHostKey: jest.fn(async () => {}),
  };
}

function check(over: Partial<HostKeyCheck>) {
  const r = repo();
  const ask = jest.fn(async () => true);
  const c: HostKeyCheck = {
    hostId: 1,
    saved: null,
    key,
    jump: false,
    name: "Box",
    ask,
    repo: r,
    ...over,
  };
  return { c, r, ask: (over.ask ?? ask) as jest.Mock };
}

test("a first key is asked about and saved when trusted", async () => {
  const { c, r, ask } = check({});
  expect(await checkHostKey(c)).toBe(true);
  expect(ask).toHaveBeenCalledWith("new", {
    ip: "box",
    port: 22,
    hostname: "Box",
    fingerprint: "SHA256:new",
    keyType: "ssh-ed25519",
    algorithm: "sha256",
  });
  expect(r.saveHostKey).toHaveBeenCalledWith(
    1,
    { fingerprint: "abcd", keyType: "ssh-ed25519" },
    false,
  );
});

test("a refused first key is not saved", async () => {
  const { c, r } = check({ ask: jest.fn(async () => false) });
  expect(await checkHostKey(c)).toBe(false);
  expect(r.saveHostKey).not.toHaveBeenCalled();
});

test("jump hops save a first key without asking", async () => {
  const { c, r, ask } = check({ jump: true });
  expect(await checkHostKey(c)).toBe(true);
  expect(ask).not.toHaveBeenCalled();
  expect(r.saveHostKey).toHaveBeenCalled();
});

test("background work with no saved key goes on without saving", async () => {
  const { c, r } = check({ ask: null });
  expect(await checkHostKey(c)).toBe(true);
  expect(r.saveHostKey).not.toHaveBeenCalled();
});

test("a matching key goes through and is marked seen", async () => {
  const { c, r, ask } = check({
    saved: { fingerprint: "ABCD", keyType: "ssh-ed25519", changedCount: 0 },
  });
  expect(await checkHostKey(c)).toBe(true);
  expect(ask).not.toHaveBeenCalled();
  expect(r.touchHostKey).toHaveBeenCalledWith(1);
});

test("a changed key warns with both fingerprints", async () => {
  const { c, r, ask } = check({
    saved: { fingerprint: "00ff", keyType: "ssh-rsa", changedCount: 2 },
  });
  expect(await checkHostKey(c)).toBe(true);
  expect(ask).toHaveBeenCalledWith(
    "changed",
    expect.objectContaining({
      fingerprint: "SHA256:new",
      oldFingerprint: await sha256OfBlob("00ff"),
      oldKeyType: "ssh-rsa",
    }),
  );
  expect(r.saveHostKey).toHaveBeenCalledWith(
    1,
    { fingerprint: "abcd", keyType: "ssh-ed25519" },
    true,
  );
});

test("a changed key is refused when nobody can be asked", async () => {
  const { c, r } = check({
    ask: null,
    saved: { fingerprint: "00ff", keyType: "ssh-rsa", changedCount: 0 },
  });
  expect(await checkHostKey(c)).toBe(false);
  expect(r.saveHostKey).not.toHaveBeenCalled();
});

test("a host that is not saved trusts for this session only", async () => {
  const { c, r, ask } = check({ hostId: null });
  expect(await checkHostKey(c)).toBe(true);
  expect(ask).toHaveBeenCalledWith("new", expect.anything());
  expect(r.saveHostKey).not.toHaveBeenCalled();
  expect(await checkHostKey({ ...c, ask: null })).toBe(true);
});

test("saved blobs show as OpenSSH SHA256 fingerprints", async () => {
  // sha256 of the bytes 00 ff, base64 without padding.
  expect(await sha256OfBlob("00ff")).toBe(
    "SHA256:But9amnuGeX733SQGNPSq/oEvL0TZdsxLrhtxxaTibg",
  );
  expect(await sha256OfBlob("not hex")).toBe("not hex");
});
