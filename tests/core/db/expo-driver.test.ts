const DOCS = "/app/Documents/SQLite";
const LIB = "/app/Library/Application Support/SQLite";
const mockFiles = new Set<string>();
const mockOpened: (string | undefined)[] = [];
const mockDeleted: [string, string | undefined][] = [];
let mockFailMove = false;

jest.mock("expo-file-system", () => {
  const path = (uri: string) => uri.replace(/^file:\/\//, "");
  return {
    Directory: class {
      uri: string;
      constructor(u: string) {
        this.uri = u;
      }
      create() {}
    },
    File: class {
      uri: string;
      constructor(u: string) {
        this.uri = u;
      }
      get exists() {
        return mockFiles.has(path(this.uri));
      }
      async move(to: { uri: string }) {
        if (mockFailMove) throw new Error("disk full");
        mockFiles.delete(path(this.uri));
        mockFiles.add(path(to.uri));
      }
    },
  };
});

jest.mock("expo-sqlite", () => ({
  defaultDatabaseDirectory: "/app/Documents/SQLite",
  openDatabaseSync: jest.fn((_name: string, _opts: unknown, dir?: string) => {
    mockOpened.push(dir);
    return {
      databasePath: `${dir}/a.db`,
      execSync: jest.fn(),
      getFirstSync: () => ({ cipher_version: "4.6" }),
      closeSync: jest.fn(),
    };
  }),
  deleteDatabaseSync: jest.fn((name: string, dir?: string) => {
    mockDeleted.push([name, dir]);
  }),
  addDatabaseChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}));

function driverOn(os: "ios" | "android") {
  let driver: any;
  jest.isolateModules(() => {
    jest.replaceProperty(require("react-native").Platform, "OS", os);
    driver = require("@/core/db/expo-driver").expoDriver;
  });
  return driver;
}
const iosDriver = () => driverOn("ios");

beforeEach(() => {
  mockFiles.clear();
  mockOpened.length = 0;
  mockDeleted.length = 0;
  mockFailMove = false;
});
afterEach(() => jest.restoreAllMocks());

test("on iOS the files move out of Documents once, and open from Library", async () => {
  mockFiles.add(`${DOCS}/a.db`);
  mockFiles.add(`${DOCS}/a.db-wal`);
  const driver = iosDriver();
  await driver.prepare("a.db");
  expect([...mockFiles].sort()).toEqual([`${LIB}/a.db`, `${LIB}/a.db-wal`]);
  driver.open("a.db", "00");
  expect(mockOpened).toEqual([LIB]);
});

test("a failed move keeps using the old folder for this run", async () => {
  mockFiles.add(`${DOCS}/a.db`);
  mockFailMove = true;
  const driver = iosDriver();
  await driver.prepare("a.db");
  driver.open("a.db", "00");
  expect(mockOpened).toEqual([undefined]);
  expect(mockFiles.has(`${DOCS}/a.db`)).toBe(true);
});

test("removing a database clears both folders", () => {
  const driver = iosDriver();
  driver.remove("a.db");
  expect(mockDeleted).toEqual([
    ["a.db", LIB],
    ["a.db", undefined],
  ]);
});

test("Android keeps the default folder and moves nothing", async () => {
  const driver = driverOn("android");
  mockFiles.add(`${DOCS}/a.db`);
  await driver.prepare("a.db");
  driver.open("a.db", "00");
  expect(mockOpened).toEqual([undefined]);
  expect(mockFiles.has(`${DOCS}/a.db`)).toBe(true);
});
