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
): number {
  if (!isLandscape) return screenHeight;
  return screenHeight * 0.4;
}

export function getTabBarHeight(isLandscape: boolean): number {
  return isLandscape ? 50 : 60;
}

export function getButtonSize(
  isLandscape: boolean,
  portraitSize: number = 44,
): number {
  return isLandscape ? portraitSize * 0.82 : portraitSize;
}
