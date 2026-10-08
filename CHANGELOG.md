# Changelog

## 1.6.0

The app now follows which Termix plugins are turned on, and RDP asks for credentials when a host has none saved.

### Added

- Hide host actions, editor sections, settings and keyboard tabs for features the server has turned off
- Refresh the server's features on pull to refresh, when the app comes back and when the server reports a feature is off

### Fixed

- RDP asks for a username and password when the host has none saved instead of failing with a security type error (#1372)
- Background tabs from features the app does not support no longer open as a terminal

## 1.5.1

Improved terminal text selection, added compatibility for Termix plugins, and fixed several bugs.

### Added

- Added compatibility for the Termix plugin update

### Changed

- Improved terminal selection system

### Fixed

- Restore format checks for guacamole assets
- Respect configured RDP resolution
- Send terminal JWT as protocol fixing infinite reconnect
- Fit VNC and keep touch cords in sync
- Host form keeps field it does not edit
- Handle TOTP/browser sign in replies for files/docker

## 1.5.0

Added home screen widgets, expanded the file manager with pinned files and a trash view, added command history and Wake-on-LAN, and fixed many terminal, keyboard, and login bugs.

### Added

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

### Changed

- Bundled Nerd Fonts, xterm, and Guacamole locally so they work offline

### Fixed

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

## 1.4.0

> [!WARNING]
> Requires Termix v2.3.2+
> Complete UI redesign, added remote desktop and Docker support, improved QOL with new host management options, and fixed many bugs.

### Added

- New login system with support for passkeys and improved UX
- Support for Docker and Remote Desktop (RDP, VNC, and Telnet)
- Added support for jump hosts, SOCKS5 proxies, override credential username, and force keyboard-interactive host options
- Added support for all the same host authentication types as Termix (warpgate, none auth, etc.)
- Added quick connect feature
- Added snippet management
- Added filter/sort in host viewer
- Added credential and host management (create, edit, and delete hosts and credentials)
- Added session management (view and connect to synced connections between web, desktop, and mobile)
- Added account management features (2FA, Active Sessions, and API keys)
- Added appearance customization (theme and accent color)
- Added app lock (requires pin/biometrics to open app)
- Added font selection for the terminal

### Changed

- Complete UI rewrite to match new Termix UI theme

### Fixed

- Allowed local network SSL in Android app
- Keep none-auth terminal prompts alive
- Preserve websocket auth context
- Open OIDC in system browser (fixes passkeys)
- Reset terminal input after special keys
- Capture iOS/iPadOS hardware keyboard special keys (tab, f1-12, etc)
- Guard Android user CA trust
- Improved mobile terminal scroll recovery
- Add shift tab hotkey
- Improved iOS terminal scroll speed

## 1.3.2

Updated compatibility to work with Termix v2.0.0

## 1.3.1

Improved background-keepalive by using Termix v1.11.2 SSH session persistence

> [!WARNING]
> Must be using Termix v1.11.2 or greater for background keepalive

## 1.3.0

Improves keyboard, accessibility, emoji, voice input, SSH host key handling, and fixes many crashes, pasting issues, keyboard UI issues, and IME bugs.

### Added

- Added support for VoiceOver

### Changed

- Improved background keepalive
- Improved hardware/Bluetooth keyboard support
- Disabled auto-correct bar
- Emoji support
- Voice dictation support
- Host key fingerprint modal support

### Fixed

- iPadOS keyboard covering the terminal tab bar
- Paste key not working
- App crashing when using none-auth
- Various Android keyboard issues
- New SSH host connections not working until approving SSH fingerprint
- Multi-character IME input not working on Android

## 1.2.0

Added support for file manager, server stats, tunnels, snippets, and new terminal/host customization

### Added

- Added landscape support
- Added file manager
  - View, edit, and copy/move files
- Added SSH tunnels
  - View, start, stop tunnels
- Added snippets to custom keyboard terminal (no command history)
  - With support for folders and executing with one click

### Changed

- Add server stats
  - Only support for CPU, RAM, and HDD widgets
- TOTP support
- “None” password option support
  - Enter password/ssh key at runtime
- Synced terminal customization (theme, font, etc.)
- Improved text selection

### Fixed

- HTTP hosts not loading
- General keyboard issues

## 1.1.0

Added keyboard/terminal customization and improved login system
This version is only compatible with Termix v1.8.0+

### Added

- Added complete keyboard customization
  - Add/remove keys in the keyboard bar or custom keyboard
  - Change key sizes
- Added terminal customization
  - Change zoom
- Support for iPadOS

### Changed

- Migrated login page to a web view to support reverse proxies and OIDC
- Download signed IPA
- Google Play Store support

### Fixed

- Android OS-trusted custom CA support

## 1.0.0

The initial release of the Termix mobile app.

### Added

- SSH Terminal Access - Full-featured SSH terminal with xterm.js integration and multi-session support
- Advanced Keyboard Features - Dual keyboard modes with a custom terminal keyboard optimized for terminal use
- Host Management - Folder-based organization with real-time server status and visual indicators
- Secure Authentication - 2FA/TOTP multi-factor authentication with JWT token-based security
- Mobile-Optimized Interface - Dark theme with responsive layout and gesture-supported design
- Real-time Communication - WebSocket-based instant responsiveness with auto-reconnect
- Server Configuration - Easy setup with auto connection testing and secure storage
