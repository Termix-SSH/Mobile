import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";

/**
 * Font families registered with expo-font. We register weight-specific
 * families because React Native cannot synthesize weights for custom fonts.
 * Tailwind `font-mono` resolves to "JetBrainsMono" (see tailwind.config.js);
 * for bold/medium text, set fontFamily explicitly via these names.
 */
export const FONT_MAP = {
  JetBrainsMono: JetBrainsMono_400Regular,
  "JetBrainsMono-Medium": JetBrainsMono_500Medium,
  "JetBrainsMono-Bold": JetBrainsMono_700Bold,
};

export const MONO_FONT = "JetBrainsMono";
export const MONO_FONT_MEDIUM = "JetBrainsMono-Medium";
export const MONO_FONT_BOLD = "JetBrainsMono-Bold";

/**
 * Terminal font, embedded at build time by the expo-font plugin (app.json).
 * Regular, bold and italic are separate files, so fontWeight and fontStyle
 * work without RN faking them.
 */
export const TERMINAL_FONT = "CaskaydiaCove NFM";
