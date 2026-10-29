# termix-terminal

The phone's native terminal view, on [libghostty](https://github.com/ghostty-org/ghostty).
On iOS it renders with Metal through [libghostty-spm](https://github.com/Lakr233/libghostty-spm)
2.2; on Android a Canvas renderer draws over libghostty-vt. The native code started as
[expo-libghostty](https://github.com/arcboxlabs/expo-libghostty) 0.8.1 (see NOTICE).

The view parses, draws and reads the keyboard. Pty output comes from a native pipe
(`pipeId`, see `modules/termix-pipe`) or from `write`; typed bytes come out through `onInput`,
so it works with any transport (the local SSH engine or the server relay).

## What it does

- Truecolor, 256 colors, bold, italic, underline styles, wide characters and emoji, alt screen
- The app's fonts: CaskaydiaCove, JetBrains Mono and Fira Code Nerd Font Mono, with ligatures
- Output parsed off the main thread, with back pressure: a full pipe pauses the SSH reader
- Software keyboard with IME composition (CJK as preedit), dictation, no auto capitals,
  hardware keyboards, and sticky Ctrl and Alt driven by the app's key row
- Selection with handles and a magnifier, copy, paste (bracketed, unsafe text asks first);
  double tap selects a word, and More in the long press menu fires `onMenu`
- Links: OSC 8 and plain addresses, opened by a tap or from the long press menu
- OSC 52 copy; a program reading the clipboard asks first
- App shortcuts from hardware keyboards (`onShortcut`, ids in `src/features/terminal/shortcuts.ts`);
  those keys never reach the shell
- Scrollback with fling, two finger scroll, scroll state events, pinch to zoom the font
- Mouse reporting: taps are clicks and drags are wheel steps while the program tracks the mouse
- Cursor style and blink, bell with sound, flash and haptics, title events
- Screen reader text and announcements of new output
- Search in the screen and scrollback (`search`, `searchNext`, `searchPrevious`, `clearSearch`,
  `onSearch`)
- The prompt line once output settles (`watchPrompt`, `onPromptLine`), for password fill

## Use

```tsx
import {
  TerminalView,
  type TerminalViewHandle,
} from "@/modules/termix-terminal";

const ref = useRef<TerminalViewHandle>(null);

<TerminalView
  ref={ref}
  pipeId="term-1"
  fontSize={14}
  fontFamily="CaskaydiaCove NFM"
  theme={theme}
  cursor={{ style: "block", blink: true }}
  onInput={(b64) => shell.write(fromBase64(b64))}
  onResize={(cols, rows) => shell.resize(cols, rows)}
/>;

// Only for output that comes through JS; piped output never passes here.
ref.current?.write(toBase64(bytes));
```

The app uses it through `src/features/terminal/TerminalView.tsx`, which adds the prompts and
the scroll to bottom button. Calls made before the view reports its first size are queued.
`isTerminalEngineAvailable` is false in Expo Go, on web and on 32 bit Android phones
(libghostty-vt is built for arm64-v8a and x86_64).

## Known limits

- Android: `scrollback` only applies before the first output.
- iOS reports no frame times (Metal draws on its own thread); `getStats` only has bytes there.
- The app's own key row is used; the accessory bars of the wrappers are left out.
- iOS search is ghostty's plain text search; match case, whole word and regex are Android only.
- Android search hits count wide characters as two cells and can be off by a cell around
  combining marks.

## Binaries

Not in git. `plugins/withTermixTerminal.js` runs `scripts/fetch-ghostty.cjs` at prebuild, which
downloads the files pinned in `ghostty.lock.json` (the GhosttyKit xcframework from libghostty-spm,
and libghostty-vt for Android built by expo-libghostty's workflow from a pinned ghostty commit),
checks their sha256 and unpacks them to `ios/vendor/Frameworks` and `android/vendor`.

## Tests

Jest tests for the JS wrapper are in `tests/modules/termix-terminal`. Kotlin unit tests (IME,
links, screen reader text) are in `android/src/test` and run in the Native check workflow, which
also builds both platforms.
