import { render, renderHook, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Button } from "@/ui/Button";
import { BottomBarShown, useBottomInset } from "@/ui/bottom-inset";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useThemeColor: () => (token: string) => `token:${token}`,
}));

test("views above the bottom bar leave the bottom inset to it", async () => {
  const alone = await renderHook(() => useBottomInset());
  expect(alone.result.current).toBe(34);
  const inTabs = await renderHook(() => useBottomInset(), {
    wrapper: ({ children }) => (
      <BottomBarShown.Provider value>{children}</BottomBarShown.Provider>
    ),
  });
  expect(inTabs.result.current).toBe(0);
});

function Icon({ color }: { color?: string }) {
  return <Text testID="icon">{color ?? "none"}</Text>;
}

test("an icon with no color follows the button text color", async () => {
  await render(
    <Button variant="muted" icon={<Icon />}>
      Link a server
    </Button>,
  );
  expect(screen.getByTestId("icon").props.children).toBe(
    "token:muted-foreground",
  );
});

test("an icon keeps a color of its own", async () => {
  await render(<Button icon={<Icon color="red" />}>Add</Button>);
  expect(screen.getByTestId("icon").props.children).toBe("red");
});
