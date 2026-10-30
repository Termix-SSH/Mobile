import { useEffect } from "react";
import { Toaster as SonnerToaster } from "sonner-native";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react-native";
import { useTheme, useThemeColor } from "@/contexts/ThemeContext";
import { MONO_FONT, MONO_FONT_MEDIUM } from "@/constants/fonts";
import { setToastPalette } from "@/utils/toast";
import { THEME_VARS, tripletToHex } from "@/constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWindowInfo } from "@/utils/window-class";
import { SIDEBAR_WIDTH, shellLayout } from "@/screens/shell/layout";

/** Toasts stop growing wider than this on tablets and opened foldables. */
const TOAST_MAX_WIDTH = 480;

/** App toaster styled like core's sonner: square card, accent for success. */
export function Toaster() {
  const { isDark, resolvedTheme, accentTriplet } = useTheme();
  const color = useThemeColor();
  const accent = tripletToHex(accentTriplet);
  const destructive = tripletToHex(THEME_VARS[resolvedTheme].destructive);
  const warning = tripletToHex(THEME_VARS[resolvedTheme].warning);
  const insets = useSafeAreaInsets();
  const win = useWindowInfo();
  // Clear of the side rail, and on the right half when a fold splits the screen.
  const rail = shellLayout(win, 0).nav === "side" ? SIDEBAR_WIDTH : 0;
  const fold = win.fold?.axis === "vertical" ? win.fold.end : 0;
  const left = Math.max(insets.left + rail, fold);
  const right = insets.right;
  // The list centers each toast, so a margin of the difference centers it between the edges.
  const shift = left - right;
  const container = {
    width: Math.min(TOAST_MAX_WIDTH, Math.max(0, win.width - left - right)),
    marginLeft: Math.max(0, shift),
    marginRight: Math.max(0, -shift),
  };

  useEffect(() => {
    setToastPalette({
      success: accent,
      info: accent,
      error: destructive,
      warning,
    });
  }, [accent, destructive, warning]);

  return (
    <SonnerToaster
      theme={isDark ? "dark" : "light"}
      position="top-center"
      toastOptions={{
        toastContainerStyle: container,
        style: {
          backgroundColor: color("card"),
          borderWidth: 1,
          borderColor: color("border"),
          borderRadius: 0,
        },
        titleStyle: {
          fontFamily: MONO_FONT_MEDIUM,
          fontSize: 12,
          color: color("foreground"),
        },
        descriptionStyle: {
          fontFamily: MONO_FONT,
          fontSize: 11,
          color: color("muted-foreground"),
        },
        // Same look as the default Button.
        actionButtonStyle: {
          backgroundColor: color("accent-brand", 0.15),
          borderWidth: 1,
          borderColor: color("accent-brand", 0.4),
          borderRadius: 0,
        },
        actionButtonTextStyle: {
          fontFamily: MONO_FONT_MEDIUM,
          color: color("foreground"),
        },
        closeButtonStyle: { borderRadius: 0 },
      }}
      icons={{
        success: <CircleCheck size={16} color={accent} />,
        info: <Info size={16} color={accent} />,
        error: <CircleX size={16} color={destructive} />,
        warning: <TriangleAlert size={16} color={warning} />,
      }}
      richColors={false}
      closeButton
      duration={4000}
    />
  );
}
