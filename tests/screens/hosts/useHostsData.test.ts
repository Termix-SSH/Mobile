import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useHostsData } from "@/screens/hosts/useHostsData";

let mockFocus: (() => void) | null = null;
let mockResolve: (() => void) | null = null;
const mockList = jest.fn(
  () =>
    new Promise<unknown[]>((resolve) => {
      mockResolve = () => resolve([{ id: 1, name: "a", ip: "1.1.1.1" }]);
    }),
);

jest.mock("expo-router", () => ({
  useFocusEffect: (fn: () => void) => {
    mockFocus = fn;
    const { useEffect } = jest.requireActual("react");
    useEffect(fn, [fn]);
  },
}));
jest.mock("@/core/accounts", () => ({
  accounts: { active: () => ({ id: "local" }) },
  activeClient: () => null,
}));
const mockRepos = {
  hosts: { list: () => mockList(), subscribe: () => () => {} },
  hostFolders: { list: async () => [], subscribe: () => () => {} },
  snippets: { list: async () => [], subscribe: () => () => {} },
};
jest.mock("@/core/data/hooks", () => ({ useRepositories: () => mockRepos }));
jest.mock("@/core/status", () => ({ useLocalStatuses: () => ({}) }));
jest.mock("@/core/sync", () => ({
  hostStatusesByLocalId: async () => ({}),
  isSynced: () => false,
}));
jest.mock("@/widgets", () => ({ publishHostSnapshot: async () => {} }));
jest.mock("@/utils/toast", () => ({ toast: { error: jest.fn() } }));

describe("useHostsData", () => {
  it("shows the spinner only on the first focus", async () => {
    const { result } = await renderHook(() => useHostsData());
    expect(result.current.loading).toBe(true);
    await act(async () => mockResolve!());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hosts).toHaveLength(1);

    await act(async () => mockFocus!());
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.hosts).toHaveLength(1);
    await act(async () => mockResolve!());
  });
});
