import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  HOSTS_PANE_HIDDEN_KEY,
  HOSTS_PANE_WIDTH,
  clampHostsPaneWidth,
  hostsPaneWidth,
  useHostsPaneHidden,
  useStoredNumber,
} from "@/screens/sessions/HostsPane";
import {
  HOSTS_PANE_MIN_WIDTH,
  SESSION_MIN_WIDTH,
} from "@/screens/shell/layout";

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

test("the pane ends at a fold edge once it knows where it starts", () => {
  expect(hostsPaneWidth(null, 463)).toBe(HOSTS_PANE_WIDTH);
  expect(hostsPaneWidth(84, undefined)).toBe(HOSTS_PANE_WIDTH);
  expect(hostsPaneWidth(84, 463)).toBe(379);
  expect(hostsPaneWidth(300, 400)).toBe(HOSTS_PANE_MIN_WIDTH);
});

test("a dragged width keeps room for the list and the terminal", () => {
  expect(clampHostsPaneWidth(400, 1000)).toBe(400);
  expect(clampHostsPaneWidth(100, 1000)).toBe(HOSTS_PANE_MIN_WIDTH);
  expect(clampHostsPaneWidth(900, 1000)).toBe(1000 - SESSION_MIN_WIDTH);
  expect(clampHostsPaneWidth(400, 400)).toBe(HOSTS_PANE_MIN_WIDTH);
});

test("a stored width survives a restart and can be cleared", async () => {
  const first = await renderHook(() => useStoredNumber("test.width"));
  expect(first.result.current[0]).toBeNull();
  await act(async () => first.result.current[1](420));
  expect(await AsyncStorage.getItem("test.width")).toBe("420");

  const next = await renderHook(() => useStoredNumber("test.width"));
  await waitFor(() => expect(next.result.current[0]).toBe(420));
  await act(async () => next.result.current[1](null));
  expect(await AsyncStorage.getItem("test.width")).toBeNull();
});
