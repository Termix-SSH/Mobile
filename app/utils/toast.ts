import { toast as sonnerToast } from "sonner-native";

/**
 * Toast helpers. Visual styling (background/border) is handled globally by the
 * themed <Toaster> in app/_layout.tsx, so we only pass the message + intent
 * here. Status accent borders are applied per-intent for quick recognition.
 */
const STATUS_BORDER: Record<string, string> = {
  success: "#16a34a",
  error: "#dc2626",
  warning: "#d97706",
  info: "#2563eb",
};

function withBorder(color?: string) {
  return color ? { style: { borderColor: color } } : undefined;
}

export const toast = {
  success: (m: string) =>
    sonnerToast.success(m, withBorder(STATUS_BORDER.success)),
  error: (m: string) => sonnerToast.error(m, withBorder(STATUS_BORDER.error)),
  warning: (m: string) =>
    sonnerToast.warning(m, withBorder(STATUS_BORDER.warning)),
  info: (m: string) => sonnerToast.info(m, withBorder(STATUS_BORDER.info)),
  message: (m: string) => sonnerToast(m),
};

// Back-compat alias for existing call sites that import showToast.
export const showToast = {
  success: toast.success,
  error: toast.error,
  warning: toast.warning,
  info: toast.info,
  default: toast.message,
};
