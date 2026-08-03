import React from "react";
import {
  requireNativeViewManager,
  type NativeModule,
} from "expo-modules-core";
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
  onFocus?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
  onBlur?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
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
