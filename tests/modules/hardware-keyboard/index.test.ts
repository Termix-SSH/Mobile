import {
  addAppShortcutListener,
  addKeyCommandListener,
  setAppShortcuts,
  setHardwareKeyboardEnabled,
} from "@/modules/hardware-keyboard";

const mockSetEnabled = jest.fn();
const mockSetShortcuts = jest.fn();

jest.mock("expo-modules-core", () => ({
  ...jest.requireActual("expo-modules-core"),
  requireOptionalNativeModule: () => ({
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setEnabled: (value: boolean) => mockSetEnabled(value),
    setAppShortcuts: (items: unknown) => mockSetShortcuts(items),
  }),
}));

test("turning the app wide key capture on and off reaches the module", () => {
  setHardwareKeyboardEnabled(true);
  setHardwareKeyboardEnabled(false);
  expect(mockSetEnabled.mock.calls).toEqual([[true], [false]]);
});

test("listeners still subscribe", () => {
  expect(addKeyCommandListener(() => {})).not.toBeNull();
});

test("app shortcuts reach the module and have a listener", () => {
  const items = [
    { id: "palette", input: "k", modifiers: ["cmd" as const], title: "Search" },
  ];
  setAppShortcuts(items);
  expect(mockSetShortcuts).toHaveBeenCalledWith(items);
  expect(addAppShortcutListener(() => {})).not.toBeNull();
});
