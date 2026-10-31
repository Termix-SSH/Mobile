import { readLocalBase64, readLocalText } from "@/utils/localFile";

const mockFiles = new Map<string, string>();

jest.mock("expo-file-system", () => ({
  File: class {
    mockUri: string;
    constructor(mockUri: string) {
      this.mockUri = mockUri;
    }
    async text() {
      return mockFiles.get(this.mockUri) ?? "";
    }
    async base64() {
      return Buffer.from(mockFiles.get(this.mockUri) ?? "").toString("base64");
    }
  },
}));

const fetchMock = jest.fn();
beforeEach(() => {
  mockFiles.clear();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

test("reads file uris from the file system", async () => {
  mockFiles.set("file:///cache/key.pem", "KEY");
  expect(await readLocalText("file:///cache/key.pem")).toBe("KEY");
  expect(await readLocalBase64("file:///cache/key.pem")).toBe("S0VZ");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("fetches http uris like dev server assets", async () => {
  fetchMock.mockResolvedValue({ text: async () => "js" });
  expect(await readLocalText("http://localhost:8081/assets/x")).toBe("js");
});

test("base64 of a large http body does not overflow the stack", async () => {
  const big = new Uint8Array(3 * 1024 * 1024).fill(65);
  fetchMock.mockResolvedValue({ arrayBuffer: async () => big.buffer });
  const out = await readLocalBase64("http://localhost/big");
  expect(out.length).toBe(Math.ceil(big.length / 3) * 4);
  expect(out.startsWith("QUFB")).toBe(true);
});
