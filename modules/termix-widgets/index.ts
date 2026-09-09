/**
 * TermixWidgets — thin bridge to the native home-screen widget hosts.
 *
 * The app hands the native side one JSON string (see app/widgets/types.ts for
 * the contract); the native side persists it in shared storage (App Group on
 * iOS, SharedPreferences on Android) and asks the widget host to redraw.
 *
 * Every export is a no-op when the native module is unavailable — Expo Go, web,
 * and older dev clients all fall into that bucket — so callers never need to
 * guard by platform.
 */

import { requireOptionalNativeModule } from "expo-modules-core";

interface TermixWidgetsNativeModule {
  /** False on platforms/OS versions where widgets can't be hosted. */
  readonly isSupported: boolean;
  /** Shared-storage container id, exposed for diagnostics. */
  readonly containerId: string;
  setSnapshot(json: string): Promise<void>;
  clearSnapshot(): Promise<void>;
  reloadWidgets(): Promise<void>;
}

const NativeModule =
  requireOptionalNativeModule<TermixWidgetsNativeModule>("TermixWidgets");

/**
 * Whether home-screen widgets can be driven on this device/build.
 * Note this is about the *native module* being present — the user may still
 * have zero widgets placed on their home screen, which we can't detect.
 */
export const isWidgetSupported: boolean = NativeModule?.isSupported ?? false;

/** Shared container identifier (App Group / SharedPreferences name), or "". */
export const widgetContainerId: string = NativeModule?.containerId ?? "";

/**
 * Publishes a snapshot and refreshes every placed widget.
 * Resolves to true when the payload reached the native side.
 */
export async function setWidgetSnapshotJson(json: string): Promise<boolean> {
  if (!NativeModule) return false;
  await NativeModule.setSnapshot(json);
  return true;
}

/** Wipes the stored snapshot — widgets fall back to their signed-out state. */
export async function clearWidgetSnapshot(): Promise<boolean> {
  if (!NativeModule) return false;
  await NativeModule.clearSnapshot();
  return true;
}

/** Asks the widget host to redraw without changing the stored payload. */
export async function reloadWidgets(): Promise<boolean> {
  if (!NativeModule) return false;
  await NativeModule.reloadWidgets();
  return true;
}
