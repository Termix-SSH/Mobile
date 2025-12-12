import { TerminalConfig } from '@/types';
import { DEFAULT_TERMINAL_CONFIG } from './terminal-themes';

export const MOBILE_DEFAULT_TERMINAL_CONFIG: Partial<TerminalConfig> = {
    ...DEFAULT_TERMINAL_CONFIG,
    fontSize: 14,
    rightClickSelectsWord: false,
    minimumContrastRatio: 1,
};