Added home screen widgets, expanded the file manager with pinned files and a trash view, added command history and Wake-on-LAN, and fixed many terminal, keyboard, and login bugs.

| Platform | Download |
|----------|----------|
| **Android** | [APK](https://github.com/Termix-SSH/Mobile/releases/download/release-1.5.0-tag/termix_android.apk) |
| **iOS** | [IPA](https://github.com/Termix-SSH/Mobile/releases/download/release-1.5.0-tag/termix_ios.ipa) |

Update Log:
- Added home screen widgets for iOS and Android
	- Quick connect, server status, and snippet widgets
	- Pick which hosts a widget shows and which tab it opens
- Added command history to the terminal
- Added Wake-on-LAN with a new MAC address field on hosts
- Added pinned files and folder shortcuts to the file manager
- Added trash view to restore deleted files
- Added file compression from the file manager
- Added file downloads through the share sheet
- Added tunnel editor to the host form
- Added configurable key repeat for the custom keyboard
- Added snippet reordering and snippet folder renaming
- Added change password and delete account to settings
- Added server alerts to the hosts screen
- Bundled Nerd Fonts, xterm, and Guacamole locally so they work offline

Bug Fixes:
- Login sessions no longer expire after 24 hours
- Mobile sessions now survive an app restart
- OIDC callbacks now route correctly instead of hitting a 404
- Login fields no longer sit behind the software keyboard
- Terminal bottom row no longer clipped, rows stay in sync with the visible area
- Touch scrolling now works in TUI apps
- Chevron down now hides the keyboard
- Paste action stays available on iOS
- Hardware keyboard keys captured correctly on iOS and routed directly on Android
- Various Android IME fixes (fast input, suggestions disabled, safe composition)
- Input preserved after backspace on iOS
- No more false heartbeat disconnects on iOS
- Keepalive failures are now surfaced instead of failing silently
- Sessions disconnect properly on unmount and no longer overlap polling requests
- Back navigation works from sessions and snippets on Android
- Docker console now connects instead of being refused
- Remote desktop protocol passed correctly, Android touch jitter tolerated
- Host endpoints now resolve behind proxies
- Clearer error when an Android device cannot reach a local IP
- Server stats widgets fit their container properly
- Android input and file manager fields now vertically centered
