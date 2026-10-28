import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  HOSTS_PANE_HIDDEN_KEY,
  useHostsPaneHidden,
} from "@/screens/sessions/HostsPane";

jest.mock("@/screens/hosts/Hosts", () => () => null);

beforeEach(() => AsyncStorage.clear());

test("the host list starts shown and remembers when it was hidden", async () => {
  const first = await renderHook(() => useHostsPaneHidden());
  expect(first.result.current[0]).toBe(false);
  await act(async () => first.result.current[1](true));
  expect(first.result.current[0]).toBe(true);
  expect(await AsyncStorage.getItem(HOSTS_PANE_HIDDEN_KEY)).toBe("1");

  const next = await renderHook(() => useHostsPaneHidden());
  await waitFor(() => expect(next.result.current[0]).toBe(true));
});
