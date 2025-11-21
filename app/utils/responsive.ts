/**
 * Responsive utility functions for adaptive layouts
 */

/**
 * Get number of columns based on screen width and orientation
 */
export function getColumnCount(width: number, isLandscape: boolean, itemMinWidth: number = 300): number {
  if (!isLandscape) return 1;

  const columns = Math.floor(width / itemMinWidth);
  return Math.max(2, Math.min(columns, 3)); // Between 2-3 columns in landscape
}

/**
 * Calculate grid item width based on column count
 */
export function getGridItemWidth(containerWidth: number, columns: number, gap: number = 16): number {
  const totalGap = gap * (columns - 1);
  return (containerWidth - totalGap) / columns;
}

/**
 * Get responsive padding
 */
export function getResponsivePadding(isLandscape: boolean, portraitPadding: number = 24): number {
  return isLandscape ? portraitPadding * 0.67 : portraitPadding; // Reduce padding by 33% in landscape
}

/**
 * Get responsive font size
 */
export function getResponsiveFontSize(isLandscape: boolean, baseFontSize: number): number {
  return isLandscape ? baseFontSize * 0.9 : baseFontSize; // Slightly smaller in landscape
}

/**
 * Get max keyboard height for landscape mode
 */
export function getMaxKeyboardHeight(screenHeight: number, isLandscape: boolean): number {
  if (!isLandscape) return screenHeight; // No limit in portrait
  return screenHeight * 0.4; // 40% max in landscape
}

/**
 * Get responsive tab bar height
 */
export function getTabBarHeight(isLandscape: boolean): number {
  return isLandscape ? 50 : 60;
}

/**
 * Get responsive button size
 */
export function getButtonSize(isLandscape: boolean, portraitSize: number = 44): number {
  return isLandscape ? portraitSize * 0.82 : portraitSize; // ~36px in landscape vs 44px portrait
}
