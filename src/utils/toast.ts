import { AccessibilityInfo } from "react-native";
import { toast as sonnerToast } from "sonner-native";

export type ToastIntent = "success" | "error" | "warning" | "info";

/** Border and text color per intent. The Toaster keeps it in step with the theme. */
const palette: Record<ToastIntent, string> = {
  success: "#f59145",
  info: "#f59145",
  error: "#ff6467",
  warning: "#fdc700",
};

export function setToastPalette(next: Record<ToastIntent, string>) {
  Object.assign(palette, next);
}

// Same as core: success and info use the accent, errors the destructive color.
export function toastStyle(intent: ToastIntent, description?: string) {
  const c = palette[intent];
  return {
    description,
    styles: {
      toast: { borderColor: c + "4d" },
      title: { color: c },
    },
  };
}

// The toast library draws but never speaks, so screen readers are told here.
function announce(m: string, description?: string) {
  AccessibilityInfo.announceForAccessibility(
    description ? `${m}. ${description}` : m,
  );
}

export const toast = {
  success: (m: string, description?: string) => {
    announce(m, description);
    return sonnerToast.success(m, toastStyle("success", description));
  },
  error: (m: string, description?: string) => {
    announce(m, description);
    return sonnerToast.error(m, toastStyle("error", description));
  },
  warning: (m: string, description?: string) => {
    announce(m, description);
    return sonnerToast.warning(m, toastStyle("warning", description));
  },
  info: (m: string, description?: string) => {
    announce(m, description);
    return sonnerToast.info(m, toastStyle("info", description));
  },
  message: (m: string, description?: string) => {
    announce(m, description);
    return sonnerToast(m, { description });
  },
};

// Back-compat alias for existing call sites that import showToast.
export const showToast = {
  success: toast.success,
  error: toast.error,
  warning: toast.warning,
  info: toast.info,
  default: toast.message,
};
