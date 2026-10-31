/**
 * Whether to show the welcome screen. Only a brand new install sees it; an
 * install that already has a server, hosts or App Lock is never asked.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const ONBOARDING_KEY = "onboarding.v2";

export interface InstallState {
  done: boolean;
  hasServers: boolean;
  hasLocalData: boolean;
  appLockOn: boolean;
}

export function shouldWelcome(state: InstallState): boolean {
  return (
    !state.done && !state.hasServers && !state.hasLocalData && !state.appLockOn
  );
}

/** True when the install was set up before this screen existed. */
export function alreadySetUp(state: InstallState): boolean {
  return !state.done && !shouldWelcome(state);
}

export async function onboardingDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markOnboardingDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
  } catch {
    // Shown again next time at worst.
  }
}
