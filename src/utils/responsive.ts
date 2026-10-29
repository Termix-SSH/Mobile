export function getMaxKeyboardHeight(
  screenHeight: number,
  isLandscape: boolean,
  isIPad: boolean = false,
): number {
  if (!isLandscape) return screenHeight;
  const cap = isIPad ? 0.6 : 0.4;
  return screenHeight * cap;
}

/** The session tab bar. A short window, like a phone held sideways, gets a slim one. */
export function getTabBarHeight(isLandscape: boolean, isShort = false): number {
  if (isShort) return 42;
  return isLandscape ? 50 : 60;
}

export function getButtonSize(
  isLandscape: boolean,
  portraitSize: number = 44,
  isShort = false,
): number {
  if (isShort) return 34;
  return isLandscape ? portraitSize * 0.82 : portraitSize;
}
