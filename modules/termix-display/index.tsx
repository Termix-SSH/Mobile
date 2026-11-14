/**
 * TermixDisplay - native view for VNC and RDP frames the SSH engine draws. Pixels go engine to view
 * by frame id; JS only places the desktop and hears hardware keys.
 */
import { requireNativeView } from "expo";
import { requireOptionalNativeModule } from "expo-modules-core";
import React, { forwardRef, useImperativeHandle, useRef } from "react";
import type { ViewProps } from "react-native";

const MODULE = "TermixDisplay";

export const isDisplayAvailable =
  requireOptionalNativeModule<{ ready?: boolean }>(MODULE)?.ready === true;

export interface DisplayKeyEvent {
  /** Android key name like "ENTER", or the key's text without modifiers on iOS. */
  key: string;
  /** The character the key types with Shift applied, or 0 / "" when none. */
  char: number | string;
  /** iOS HID usage, when there is one. */
  code?: number;
  down: boolean;
}

/**
 * A trackpad or mouse on the view (iOS), at view points. `buttons`: 1 left, 2 middle, 4 right.
 * `dy` is the scroll distance in points, positive when the content is pulled down.
 */
export interface DisplayPointerEvent {
  kind: "hover" | "down" | "move" | "up" | "scroll";
  x: number;
  y: number;
  buttons: number;
  dy: number;
}

export interface TermixDisplayViewProps extends ViewProps {
  frameId: string;
  /** Scale, then the top left corner in remote pixels. */
  placement: [number, number, number];
  onKey?: (event: { nativeEvent: DisplayKeyEvent }) => void;
  onPointer?: (event: { nativeEvent: DisplayPointerEvent }) => void;
}

export interface TermixDisplayHandle {
  focus(): void;
}

const NativeView: React.ComponentType<
  TermixDisplayViewProps & { ref?: React.Ref<unknown> }
> | null = isDisplayAvailable ? requireNativeView(MODULE) : null;

export const TermixDisplayView = forwardRef<
  TermixDisplayHandle,
  TermixDisplayViewProps
>(function TermixDisplayView(props, ref) {
  const native = useRef<{ focus?: () => Promise<void> } | null>(null);
  useImperativeHandle(ref, () => ({
    focus: () => void native.current?.focus?.(),
  }));
  if (!NativeView) return null;
  return <NativeView ref={native} {...props} />;
});
