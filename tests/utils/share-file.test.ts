import * as Sharing from "expo-sharing";
import { shareTempFile } from "@/utils/share-file";

const mockFiles = new Map<string, string>();
jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache" },
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `file:///${dir}/${name}`;
    }
    create() {
      mockFiles.set(this.uri, "");
    }
    write(text: string) {
      mockFiles.set(this.uri, text);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => {}) }));

beforeEach(() => mockFiles.clear());

test("the file is shared and then deleted", async () => {
  await shareTempFile("a.json", "{}", {
    mimeType: "application/json",
    dialogTitle: "Save",
  });
  expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/a.json", {
    mimeType: "application/json",
    dialogTitle: "Save",
  });
  expect(mockFiles.size).toBe(0);
});

test("a failed share still deletes the file", async () => {
  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error("no apps"));
  await expect(
    shareTempFile("b.json", "secret", {
      mimeType: "application/json",
      dialogTitle: "Save",
    }),
  ).rejects.toThrow("no apps");
  expect(mockFiles.size).toBe(0);
});
