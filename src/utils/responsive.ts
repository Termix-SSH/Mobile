export function getColumnCount(
  width: number,
  isLandscape: boolean,
  itemMinWidth: number = 300,
): number {
  if (!isLandscape) return 1;

  const columns = Math.floor(width / itemMinWidth);
  return Math.max(2, Math.min(columns, 3));
}

export function getResponsivePadding(
  isLandscape: boolean,
  portraitPadding: number = 24,
): number {
  return isLandscape ? portraitPadding * 0.67 : portraitPadding;
}

export function getResponsiveFontSize(
  isLandscape: boolean,
  baseFontSize: number,
): number {
  return isLandscape ? baseFontSize * 0.9 : baseFontSize;
}

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
