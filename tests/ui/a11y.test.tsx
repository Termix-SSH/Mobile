import { AccessibilityInfo, Text as RNText } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import {
  AccordionSection,
  Button,
  EmptyState,
  Field,
  Input,
  ListRow,
  PinPad,
  Sheet,
  Text,
} from "@/ui";
import { MAX_FONT_SCALE } from "@/ui/Text";
import { reduceMotionOn, useReduceMotion } from "@/ui/motion";
import { toast } from "@/utils/toast";

jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => () => "#888888",
  useUiColors: () =>
    new Proxy({}, { get: () => "#888888" }) as Record<string, string>,
  useTheme: () => ({ isDark: true }),
}));
jest.mock("sonner-native", () => {
  const t: any = jest.fn();
  t.success = t.error = t.warning = t.info = jest.fn();
  return { toast: t };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

test("an icon button is found by its label", async () => {
  await render(
    <Button size="icon" accessibilityLabel="Refresh" onPress={() => {}}>
      <RNText>R</RNText>
    </Button>,
  );
  expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
});

test("a field names the input inside it", async () => {
  await render(
    <Field label="Port" error="Too high">
      <Input value="99999" />
    </Field>,
  );
  expect(screen.getByLabelText("Port")).toBeTruthy();
  expect(screen.getByText("Too high").props.accessibilityLiveRegion).toBe(
    "polite",
  );
});

test("text stops growing at the cap", async () => {
  await render(<Text>hi</Text>);
  expect(screen.getByText("hi").props.maxFontSizeMultiplier).toBe(
    MAX_FONT_SCALE,
  );
});

test("a sheet title is a header and the backdrop is skipped", async () => {
  const onClose = jest.fn();
  await render(<Sheet visible title="Delete host?" onClose={onClose} />);
  expect(screen.getByRole("header", { name: "Delete host?" })).toBeTruthy();
  // Only the X button closes for a screen reader.
  expect(screen.getAllByLabelText("Close")).toHaveLength(1);
});

test("an accordion says whether it is open", async () => {
  await render(
    <AccordionSection label="Advanced">
      <Text>inside</Text>
    </AccordionSection>,
  );
  const header = screen.getByRole("button", { name: "Advanced" });
  expect(header.props.accessibilityState).toMatchObject({ expanded: false });
  await fireEvent.press(header);
  expect(
    screen.getByRole("button", { name: "Advanced" }).props.accessibilityState,
  ).toMatchObject({ expanded: true });
});

test("the PIN pad keys read their digit, and a missing fingerprint key is hidden", async () => {
  const onChange = jest.fn();
  await render(<PinPad value="" onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText("7"));
  expect(onChange).toHaveBeenCalledWith("7");
  expect(
    screen.getByLabelText("Use biometrics", { includeHiddenElements: true })
      .props.accessibilityElementsHidden,
  ).toBe(true);
});

test("a long press row offers the long press as an action", async () => {
  const onLongPress = jest.fn();
  await render(<ListRow title="web" onLongPress={onLongPress} />);
  const row = screen.getByRole("button");
  expect(row.props.accessibilityActions).toEqual([
    { name: "longpress", label: "More actions" },
  ]);
  await fireEvent(row, "accessibilityAction", {
    nativeEvent: { actionName: "longpress" },
  });
  expect(onLongPress).toHaveBeenCalled();
});

test("an empty state title is a header", async () => {
  await render(<EmptyState title="No hosts" hint="Add one" />);
  expect(screen.getByRole("header", { name: "No hosts" })).toBeTruthy();
});

test("toasts are read out", () => {
  const announce = jest
    .spyOn(AccessibilityInfo, "announceForAccessibility")
    .mockImplementation(() => {});
  toast.error("Could not save", "The server is offline");
  expect(announce).toHaveBeenCalledWith(
    "Could not save. The server is offline",
  );
  announce.mockRestore();
});

test("reduce motion follows the system setting", async () => {
  let listener: ((on: boolean) => void) | null = null;
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((
    _: string,
    l: (on: boolean) => void,
  ) => {
    listener = l;
    return { remove: () => {} };
  }) as never);
  function Probe() {
    return <Text>{useReduceMotion() ? "still" : "moving"}</Text>;
  }
  await render(<Probe />);
  expect(screen.getByText("moving")).toBeTruthy();
  await act(async () => listener?.(true));
  expect(screen.getByText("still")).toBeTruthy();
  expect(reduceMotionOn()).toBe(true);
});
