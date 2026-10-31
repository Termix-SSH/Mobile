import { render } from "@testing-library/react-native";

import {
  TermixDisplayView,
  isDisplayAvailable,
} from "@/modules/termix-display";

// Jest has no native module, like Expo Go or the web.
test("renders nothing without the native module", async () => {
  expect(isDisplayAvailable).toBe(false);
  const screen = await render(
    <TermixDisplayView frameId="f" placement={[1, 0, 0]} />,
  );
  expect(screen.toJSON()).toBeNull();
});
