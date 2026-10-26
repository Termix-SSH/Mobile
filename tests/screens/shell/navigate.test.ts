import { router } from "expo-router";
import { openTab } from "@/screens/shell/navigate";

jest.mock("expo-router", () => ({
  router: {
    navigate: jest.fn(),
    dismissTo: jest.fn(),
    canDismiss: jest.fn(),
  },
}));

const mocked = router as unknown as Record<string, jest.Mock>;

beforeEach(() => jest.clearAllMocks());

test("inside the tabs it switches tab", () => {
  mocked.canDismiss.mockReturnValue(false);
  openTab("/(tabs)/sessions");
  expect(router.navigate).toHaveBeenCalledWith("/(tabs)/sessions");
  expect(router.dismissTo).not.toHaveBeenCalled();
});

test("from a stacked screen it goes back to the tabs instead of pushing more", () => {
  mocked.canDismiss.mockReturnValue(true);
  openTab("/(tabs)/sessions");
  expect(router.dismissTo).toHaveBeenCalledWith("/(tabs)/sessions");
  expect(router.navigate).not.toHaveBeenCalled();
});
