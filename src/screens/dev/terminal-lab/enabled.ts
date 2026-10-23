/** The lab is in dev builds, and in release builds CI makes with the flag set. */
export function labEnabled(
  dev: boolean = __DEV__,
  flag: string | undefined = process.env.EXPO_PUBLIC_TERMINAL_LAB,
): boolean {
  return dev || flag === "1";
}
