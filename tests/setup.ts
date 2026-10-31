jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    canUseBiometricAuthentication: jest.fn(() => true),
    WHEN_UNLOCKED: 0,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 2,
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
    __reset: () => store.clear(),
  };
});

// The app logger is chatty. Set TEST_LOGS=1 to see it.
if (!process.env.TEST_LOGS) {
  for (const level of [
    "log",
    "info",
    "warn",
    "error",
    "debug",
    "group",
    "groupEnd",
  ] as const) {
    jest.spyOn(console, level).mockImplementation(() => {});
  }
}

// Worklets needs its native runtime, which Jest doesn't have.
jest.mock("react-native-worklets", () =>
  require("react-native-worklets/src/mock"),
);

// Native views that have no JS fallback under Jest.
jest.mock("react-native-webview", () => {
  const { View } = require("react-native");
  return { __esModule: true, WebView: View, default: View };
});

jest.mock("expo-video", () => {
  const { View } = require("react-native");
  return {
    VideoView: View,
    useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn() }),
  };
});

// The real store is SQLCipher in native code. Tests use better-sqlite3
// through tests/helpers/db.ts instead.
jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(() => {
    throw new Error("Use tests/helpers/db.ts in tests");
  }),
  deleteDatabaseSync: jest.fn(),
  addDatabaseChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock("expo-crypto", () => {
  const crypto = require("node:crypto");
  return {
    getRandomBytes: (n: number) => new Uint8Array(crypto.randomBytes(n)),
    randomUUID: () => crypto.randomUUID(),
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digest: async (_alg: string, data: Uint8Array) => {
      const out = crypto.createHash("sha256").update(data).digest();
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
    },
  };
});
