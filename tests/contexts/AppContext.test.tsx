import { renderHook, waitFor } from "@testing-library/react-native";
import { AppProvider, useAppContext } from "@/contexts/AppContext";
import { getLatestGitHubRelease } from "@/core/updates";
import { resetStorage } from "../helpers/http";

jest.mock("@/core/updates", () => ({
  ...jest.requireActual("@/core/updates"),
  getLatestGitHubRelease: jest.fn(),
}));

beforeEach(resetStorage);

test("startup does not wait for the update check", async () => {
  // A request that never answers, like a phone with no network.
  jest.mocked(getLatestGitHubRelease).mockReturnValue(new Promise(() => {}));
  const { result } = await renderHook(() => useAppContext(), {
    wrapper: AppProvider,
  });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.showUpdateScreen).toBe(false);
});

test("the context value keeps its identity between renders", async () => {
  jest.mocked(getLatestGitHubRelease).mockResolvedValue(null);
  const { result, rerender } = await renderHook(() => useAppContext(), {
    wrapper: AppProvider,
  });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  const first = result.current;
  await rerender({});
  expect(result.current).toBe(first);
});
