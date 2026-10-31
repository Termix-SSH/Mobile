import { render, screen } from "@testing-library/react-native";

import {
  statusLabel,
  TabStatusMark,
} from "@/screens/sessions/navigation/TabStatusMark";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => (token: string) => token,
}));

test("healthy tabs show nothing, others get a mark and a label", async () => {
  expect(statusLabel("connected")).toBeNull();
  expect(statusLabel(undefined)).toBeNull();
  expect(statusLabel("reconnecting")).toBe("Reconnecting");
  expect(statusLabel("offline")).toBe("Waiting for network");
  expect(statusLabel("failed")).toBe("Connection failed");

  await render(<TabStatusMark state="connected" />);
  expect(screen.queryByTestId("tab-status-mark")).toBeNull();
});

test("the mark's color follows the state", async () => {
  await render(<TabStatusMark state="failed" />);
  expect(screen.getByTestId("tab-status-mark")).toHaveStyle({
    backgroundColor: "destructive",
  });
  await render(<TabStatusMark state="reconnecting" />);
  expect(screen.getByTestId("tab-status-mark")).toHaveStyle({
    backgroundColor: "warning",
  });
});
