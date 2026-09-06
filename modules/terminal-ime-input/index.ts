import React from "react";
import { requireNativeViewManager, type NativeModule } from "expo-modules-core";
import type { NativeSyntheticEvent, ViewProps } from "react-native";

export type TerminalImeInputCommitEvent = {
  text: string;
};

export type TerminalImeInputSpecialKeyEvent = {
  key: string;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  source: "native-ime";
};

export type TerminalImeInputCompositionStateEvent = {
  active: boolean;
};

export type TerminalImeInputProps = ViewProps & {
  onCommitText?: (
    event: NativeSyntheticEvent<TerminalImeInputCommitEvent>,
  ) => void;
  onSpecialKey?: (
    event: NativeSyntheticEvent<TerminalImeInputSpecialKeyEvent>,
  ) => void;
  onCompositionStateChange?: (
    event: NativeSyntheticEvent<TerminalImeInputCompositionStateEvent>,
  ) => void;
  onImeFocus?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
  onImeBlur?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
};

export type TerminalImeInputHandle = NativeModule & {
  focus: () => Promise<void> | void;
  blur: () => Promise<void> | void;
  clear: () => Promise<void> | void;
};

const NativeTerminalImeInputView =
  requireNativeViewManager<TerminalImeInputProps>("TerminalImeInput");

type TerminalImeInputNativeComponent = React.ComponentType<
  TerminalImeInputProps & React.RefAttributes<TerminalImeInputHandle>
>;

export default NativeTerminalImeInputView as TerminalImeInputNativeComponent;

// The hidden input is conditionally rendered, so a queued timer or animation
// frame can reach a ref whose native view is already detached. Expo throws
// "Unable to find the view with tag" in that case, which surfaces as an
// unhandled promise rejection. These calls are all fire and forget, so swallow
// the error instead.
export function callImeInput(
  ref: React.RefObject<TerminalImeInputHandle | null> | null | undefined,
  method: "focus" | "blur" | "clear",
): void {
  const handle = ref?.current;
  if (!handle) {
    return;
  }

  try {
    const result = handle[method]?.();
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => {});
    }
  } catch {
    // view is gone
  }
}
