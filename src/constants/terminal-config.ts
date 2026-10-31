import { TerminalConfig } from "@/types";

/** A phone terminal before the user or the host changes anything. */
export const MOBILE_DEFAULT_TERMINAL_CONFIG: Partial<TerminalConfig> = {
  cursorBlink: true,
  cursorStyle: "block",
  fontSize: 14,
  fontFamily: "CaskaydiaCove NFM",
  letterSpacing: 0,
  lineHeight: 1,
  theme: "termix",
  scrollback: 10000,
  bellStyle: "none",
  rightClickSelectsWord: false,
  fastScrollModifier: "alt",
  fastScrollSensitivity: 5,
  minimumContrastRatio: 1,
  backspaceMode: "normal",
  agentForwarding: false,
  environmentVariables: [],
  startupSnippetId: null,
  autoMosh: false,
  moshCommand: "mosh-server new -s -l LANG=en_US.UTF-8",
  customThemeColors: null,
  linkClickBehavior: "confirm",
  haptics: true,
  optionAsMeta: false,
};
