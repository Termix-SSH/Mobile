import axios from "axios";
import { getLatestGitHubRelease, isNewerVersion } from "@/core/updates";

afterEach(() => jest.restoreAllMocks());

test("reads the tag and gives up after a few seconds", async () => {
  const get = jest.spyOn(axios, "get").mockResolvedValue({
    data: { tag_name: "v2.0.1", published_at: "2026-11-01" },
  });
  await expect(getLatestGitHubRelease()).resolves.toEqual({
    version: "2.0.1",
    tagName: "v2.0.1",
    publishedAt: "2026-11-01",
  });
  expect(get.mock.calls[0][1]).toEqual({ timeout: 5000 });
});

test("an odd tag or a failed request gives nothing", async () => {
  jest.spyOn(axios, "get").mockResolvedValueOnce({ data: { tag_name: "x" } });
  await expect(getLatestGitHubRelease()).resolves.toBeNull();
  jest.spyOn(axios, "get").mockRejectedValueOnce(new Error("offline"));
  await expect(getLatestGitHubRelease()).resolves.toBeNull();
});

test("version compare", () => {
  expect(isNewerVersion("2.0.1", "2.0.0")).toBe(true);
  expect(isNewerVersion("2.0.0", "2.0.0")).toBe(false);
  expect(isNewerVersion("1.9.9", "2.0.0")).toBe(false);
  expect(isNewerVersion("2.0", "2.0.0")).toBe(false);
});
