import { render, screen } from "@testing-library/react-native";
import { SideBar } from "@/screens/shell/SideBar";
import { windowInfo } from "@/utils/window-class";

let mockWin = windowInfo(669, 951);

jest.mock("@/utils/window-class", () => ({
  ...jest.requireActual("@/utils/window-class"),
  useWindowInfo: () => mockWin,
}));
jest.mock("react-native-safe-area-context", () => ({
  // The iPhone Duo bar column on the right.
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 86 }),
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => (token: string) => `token:${token}`,
}));
jest.mock("@/contexts/TerminalSessionsContext", () => ({
  useTerminalSessions: () => ({ sessions: [] }),
}));
jest.mock("@/core/sessions/status", () => ({
  ...jest.requireActual("@/core/sessions/status"),
  useSessionStatuses: () => ({}),
}));

const props = {
  state: { index: 0, routes: [{ key: "home", name: "index" }] },
  navigation: { emit: jest.fn(), navigate: jest.fn() },
  descriptors: {},
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
} as unknown as Parameters<typeof SideBar>[0];

// The rail is the outermost view.
const bottomPadding = () => {
  const rail = screen.toJSON();
  if (!rail || Array.isArray(rail)) throw new Error("expected one rail view");
  return [rail.props.style]
    .flat(Infinity)
    .reduce<number | undefined>(
      (p, s) => (s as { paddingBottom?: number })?.paddingBottom ?? p,
      undefined,
    );
};

// iPhone Duo inner screen bent like a laptop, crease from 466.5 to 484.5.
const laptop = (active: boolean) =>
  windowInfo(
    669,
    951,
    [{ x: 0, y: 466.5, width: 669, height: 18, active }],
    "right",
  );

test("bent like a laptop, the rail's tabs stay above the crease", async () => {
  mockWin = laptop(true);
  await render(<SideBar {...props} side="right" inBar />);
  // Up to where the clear area around the crease starts.
  expect(bottomPadding()).toBe(951 - mockWin.fold!.start + 8);
  expect(mockWin.fold!.start).toBeLessThanOrEqual(466.5);
});

test("flat, the rail's tabs sit at the bottom of the column", async () => {
  mockWin = laptop(false);
  await render(<SideBar {...props} side="right" inBar />);
  expect(bottomPadding()).toBe(20 + 8);
});
