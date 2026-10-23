// Wraps a native terminal view module in the lab's surface contract.
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { ComponentType, Ref } from "react";
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from "react-native";
import { requireNativeView } from "expo";
import { requireOptionalNativeModule } from "expo-modules-core";

import type {
  EngineStats,
  SurfaceTheme,
  TerminalSurfaceHandle,
  TerminalSurfaceProps,
} from "./surface";

type Ev<T> = NativeSyntheticEvent<T>;

interface NativeHandle {
  write(base64: string): Promise<void>;
  paste(text: string): Promise<void>;
  scrollToBottom(): Promise<void>;
  copySelection(): Promise<void>;
  focus(): Promise<void>;
  blur(): Promise<void>;
  getStats(): Promise<EngineStats>;
}

interface NativeProps {
  fontSize: number;
  theme: Record<string, unknown>;
  onInput: (e: Ev<{ data: string }>) => void;
  onResize: (e: Ev<{ cols: number; rows: number }>) => void;
  onBell?: (e: Ev<object>) => void;
  onTitleChange?: (e: Ev<{ title: string }>) => void;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<NativeHandle>;
}

export function nativeTheme(theme: SurfaceTheme): Record<string, unknown> {
  return {
    background: theme.background,
    foreground: theme.foreground,
    cursorColor: theme.cursor,
    selectionBackground: theme.selectionBackground,
    palette: theme.palette,
  };
}

/**
 * The native view registers after the first commit, so calls made before it
 * reports its first grid size are queued, like expo-libghostty 0.8.1 does.
 */
export function createCallQueue() {
  let ready = false;
  const pending: (() => void)[] = [];
  return {
    run(call: () => void) {
      if (ready) call();
      else pending.push(call);
    },
    markReady() {
      if (ready) return;
      ready = true;
      for (const call of pending.splice(0)) call();
    },
    get ready() {
      return ready;
    },
  };
}

/** A surface over one of the spike's native view modules. */
export function createNativeSurface(moduleName: string, displayName: string) {
  const NativeView: ComponentType<NativeProps> | null =
    requireOptionalNativeModule(moduleName) != null
      ? requireNativeView(moduleName)
      : null;

  const Surface = forwardRef<TerminalSurfaceHandle, TerminalSurfaceProps>(
    function NativeSurface(props, ref) {
      const native = useRef<NativeHandle>(null);
      const queue = useMemo(createCallQueue, []);

      useImperativeHandle(ref, () => {
        const call = (fn: (n: NativeHandle) => Promise<unknown>) =>
          queue.run(() => {
            if (native.current) fn(native.current).catch(() => {});
          });
        return {
          write: (b64) => call((n) => n.write(b64)),
          paste: (text) => call((n) => n.paste(text)),
          scrollToBottom: () => call((n) => n.scrollToBottom()),
          copySelection: () => call((n) => n.copySelection()),
          focus: () => call((n) => n.focus()),
          blur: () => call((n) => n.blur()),
          getStats: async () =>
            queue.ready && native.current ? native.current.getStats() : null,
        };
      }, [queue]);

      if (!NativeView) return null;
      return (
        <NativeView
          ref={native}
          style={props.style}
          fontSize={props.fontSize}
          theme={nativeTheme(props.theme)}
          onInput={(e) => props.onInput(e.nativeEvent.data)}
          onResize={(e) => {
            queue.markReady();
            props.onResize(e.nativeEvent.cols, e.nativeEvent.rows);
          }}
          onBell={() => props.onBell?.()}
          onTitleChange={(e) => props.onTitle?.(e.nativeEvent.title)}
        />
      );
    },
  );
  Surface.displayName = displayName;
  return { Surface, available: NativeView != null };
}
