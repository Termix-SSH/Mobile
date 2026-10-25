import { fireEvent, render, screen } from "@testing-library/react-native";
import ListLab from "@/screens/dev/list-lab/ListLab";
import { bigFileList, bigHostList } from "@/screens/dev/list-lab/fixtures";
import { sortEntries } from "@/features/file-manager/utils/fileUtils";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888888",
  useUiColors: () =>
    new Proxy({}, { get: () => "#888888" }) as Record<string, string>,
  useTheme: () => ({ isDark: true }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

test("the fixtures are the same on every run", () => {
  expect(bigHostList(5)).toEqual(bigHostList(5));
  expect(bigFileList(5).map((f) => f.name)).toEqual(
    bigFileList(5).map((f) => f.name),
  );
  expect(bigHostList(2000)).toHaveLength(2000);
});

test("the lab draws both lists and says when it can't measure", async () => {
  await render(<ListLab />);
  expect(screen.getByText("Hosts 2,000")).toBeTruthy();
  await fireEvent.press(screen.getByText("Files 20,000"));
  const first = sortEntries(bigFileList(20000))[0];
  expect(screen.getByLabelText(first.name)).toBeTruthy();
  await fireEvent.press(screen.getByText("Measure"));
  expect(
    screen.getByText("The frame monitor is not in this build."),
  ).toBeTruthy();
});
