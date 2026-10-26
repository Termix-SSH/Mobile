import { fireEvent, render, screen } from "@testing-library/react-native";

import * as mockService from "@/modules/termix-session-service";
import { BackgroundSessionsSection } from "@/screens/settings/BackgroundSessionsSection";

jest.mock("@/modules/termix-session-service", () => ({
  isSessionServiceAvailable: true,
  ignoresBatteryOptimizations: jest.fn(() => false),
  notificationsEnabled: jest.fn(() => false),
  openBatteryOptimizationSettings: jest.fn(() => true),
  openNotificationSettings: jest.fn(() => true),
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
}));
const mockSetEnabled = jest.fn(async (_on: boolean) => {});
jest.mock("@/core/sessions/background", () => ({
  backgroundSessions: {
    isEnabled: true,
    setEnabled: (on: boolean) => mockSetEnabled(on),
  },
}));
jest.mock("@/core/sessions/lifecycle", () => ({
  sessionLifecycle: { isLowPower: true, watch: () => () => {} },
}));

test("Android shows the switch, battery help and notification help", async () => {
  await render(
    <BackgroundSessionsSection open onToggle={() => {}} os="android" />,
  );
  expect(screen.getByText("Keep sessions running")).toBeTruthy();
  await fireEvent.press(screen.getByText("Open battery settings"));
  expect(mockService.openBatteryOptimizationSettings).toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Open notification settings"));
  expect(mockService.openNotificationSettings).toHaveBeenCalled();
  expect(screen.getByText(/Battery saver is on/)).toBeTruthy();
});

test("iOS says plainly that sessions pause, with no switch", async () => {
  const view = await render(
    <BackgroundSessionsSection open onToggle={() => {}} os="ios" />,
  );
  expect(
    view.getByText(/iOS stops apps soon after you leave them/),
  ).toBeTruthy();
  expect(view.queryByText("Keep sessions running")).toBeNull();
  expect(view.getByText(/Low Power Mode is on/)).toBeTruthy();
});

test("web shows nothing", async () => {
  await render(<BackgroundSessionsSection open onToggle={() => {}} os="web" />);
  expect(screen.toJSON()).toBeNull();
});
