import { fireEvent, render, screen } from "@testing-library/react-native";
import { MissingTab } from "@/screens/sessions/MissingTab";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#000000",
}));

test("a tab whose plugin was turned off says so and can be closed", async () => {
  const onClose = jest.fn();
  await render(<MissingTab title="web1 Proxmox" isVisible onClose={onClose} />);
  expect(screen.getByText("This is turned off on the server")).toBeTruthy();
  expect(screen.getByText(/web1 Proxmox comes back here/)).toBeTruthy();
  await fireEvent.press(screen.getByText("Close tab"));
  expect(onClose).toHaveBeenCalled();
});
