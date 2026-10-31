import { fireEvent, render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Welcome from "@/screens/onboarding/Welcome";
import {
  alreadySetUp,
  markOnboardingDone,
  onboardingDone,
  shouldWelcome,
} from "@/core/onboarding";
import { resetStorage } from "../../helpers/http";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/features/host-transfer/ImportPanel", () => ({
  ImportPanel: () => null,
}));
jest.mock("@/screens/settings/RestoreBackup", () => ({
  useRestoreBackup: () => ({ start: jest.fn(), sheet: null, busy: false }),
}));

beforeEach(resetStorage);

const fresh = {
  done: false,
  hasServers: false,
  hasLocalData: false,
  appLockOn: false,
};

test("only a brand new install is welcomed", () => {
  expect(shouldWelcome(fresh)).toBe(true);
  expect(shouldWelcome({ ...fresh, done: true })).toBe(false);
  expect(shouldWelcome({ ...fresh, hasServers: true })).toBe(false);
  expect(shouldWelcome({ ...fresh, hasLocalData: true })).toBe(false);
  expect(shouldWelcome({ ...fresh, appLockOn: true })).toBe(false);
  // An install set up before the welcome screen is marked done quietly.
  expect(alreadySetUp({ ...fresh, hasLocalData: true })).toBe(true);
  expect(alreadySetUp(fresh)).toBe(false);
  expect(alreadySetUp({ ...fresh, done: true, hasServers: true })).toBe(false);
});

test("the welcome flag is kept", async () => {
  expect(await onboardingDone()).toBe(false);
  await markOnboardingDone();
  expect(await onboardingDone()).toBe(true);
  expect(await AsyncStorage.getItem("onboarding.v2")).toBe("1");
});

test("the three choices say what they do and report back", async () => {
  const onDone = jest.fn();
  await render(<Welcome onDone={onDone} />);
  expect(screen.getByText(/kept encrypted on this phone/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Use without a server"));
  expect(onDone).toHaveBeenLastCalledWith("standalone");
  await fireEvent.press(screen.getByLabelText("Link a Termix server"));
  expect(onDone).toHaveBeenLastCalledWith("link");
  await fireEvent.press(screen.getByLabelText("Import"));
  expect(screen.getByText("Restore a backup")).toBeTruthy();
  await fireEvent.press(screen.getByText("Skip for now"));
  expect(onDone).toHaveBeenLastCalledWith("import");
});
