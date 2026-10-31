import { createRef } from "react";
import { render } from "@testing-library/react-native";

import {
  TermixDisplayView,
  isDisplayAvailable,
  type TermixDisplayHandle,
} from "@/modules/termix-display";

const mockNative: { props: Record<string, any>; focus: jest.Mock } = {
  props: {},
  focus: jest.fn(),
};

jest.mock("expo-modules-core", () => ({
  ...jest.requireActual("expo-modules-core"),
  requireOptionalNativeModule: () => ({ ready: true }),
}));

jest.mock("expo", () => {
  const React = require("react");
  return {
    requireNativeView: () =>
      React.forwardRef(function NativeDisplay(
        props: Record<string, any>,
        ref: any,
      ) {
        mockNative.props = props;
        React.useImperativeHandle(ref, () => ({ focus: mockNative.focus }));
        return null;
      }),
  };
});

test("passes the frame and placement and focuses the native view", async () => {
  expect(isDisplayAvailable).toBe(true);
  const ref = createRef<TermixDisplayHandle>();
  await render(
    <TermixDisplayView ref={ref} frameId="f" placement={[2, 10, 20]} />,
  );
  expect(mockNative.props.frameId).toBe("f");
  expect(mockNative.props.placement).toEqual([2, 10, 20]);
  ref.current?.focus();
  expect(mockNative.focus).toHaveBeenCalled();
});
