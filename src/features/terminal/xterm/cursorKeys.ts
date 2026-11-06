/** Runs inside the WebView, where xterm owns the current DEC cursor mode. */
export const cursorKeysScript = String.raw`
window.sendTerminalKeySequence = function(data) {
  if (terminal.modes.applicationCursorKeysMode) {
    data = data.replace(/^(\x1b?)\x1b\[([ABCDHF])$/, '$1\x1bO$2');
  }
  forwardTerminalInput(data);
};
`;
