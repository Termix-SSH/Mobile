import { TerminalConfig } from '@/types';
import { DEFAULT_TERMINAL_CONFIG } from './terminal-themes';

// Mobile-specific defaults (simpler than desktop)
export const MOBILE_DEFAULT_TERMINAL_CONFIG: Partial<TerminalConfig> = {
    ...DEFAULT_TERMINAL_CONFIG,
    // Override desktop defaults for mobile
    fontSize: 14, // Smaller for mobile screens
    rightClickSelectsWord: false, // Not applicable on mobile
    minimumContrastRatio: 1, // Keep simple
};

// Supported features for mobile (subset of desktop)
export const MOBILE_SUPPORTED_FEATURES = {
    themes: true,
    fonts: true,
    cursorCustomization: true,
    environmentVariables: true,
    startupSnippet: true,
    initialPath: false, // Not for terminal (file manager only)
    agentForwarding: true,
    autoMosh: false, // Skip for mobile simplicity
    commandHistory: false, // Skip complex WebView features
    commandAutocomplete: false,
};
