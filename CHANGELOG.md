# Changelog

## 2.0.0

Termix Mobile now works with no server. Hosts, logins and snippets stay encrypted on the phone, and the terminal, files, tunnels, Docker, metrics, services and remote desktop connect straight from it. Link one or more Termix servers to sync with them and use their plugins.

### Added

- Use the app with no server: an encrypted local database, backups locked with a passphrase, and SSH, Telnet, RDP and VNC straight from the phone
- Link more than one Termix server, switch between them, and sync hosts, logins, snippets and settings both ways, also offline and in the background
- Pick per host whether it connects from the phone, through the server or automatically
- Home with open sessions, quick connect, recent and pinned hosts, and live cards for metrics, Docker and services
- A Tools tab and a search palette for hosts, snippets, actions and settings
- Hosts: drag to reorder, select many at once, sub-hosts, filters, colors and icons, jump host order, host defaults
- New native terminal: faster, smooth scrolling, text selection, links, mouse support, OSC 52 and OSC 8
- Terminal themes, fonts with ligatures, cursor, bell, scrollback and pinch to zoom, set globally or per host
- Key rows in groups (Main, Nav, Symbols, Ctrl, tmux), long press keys, sticky Shift and custom keys per host
- Find in the terminal, tmux attach and windows, password and sudo fill at prompts, command history search
- Tab menu to rename, move, split, share and view the connection log, plus drag and swipe between tabs
- Sessions keep running in the background on Android, tabs come back after the app is closed, and reconnects keep what you typed
- File manager over SFTP with no server: transfers with pause and resume, share to a host, code editor, previews and a panel beside the terminal
- Docker, host metrics with history, and systemd or OpenRC services with the journal, on the phone or through the server
- Tunnels on the phone: local, remote and dynamic forwards with auto start (#86)
- Run snippets on many hosts, snippet variables, notes, folders and import or export
- Wake-on-LAN, host status, Tailscale devices and Tailscale SSH checks with no server
- OPKSSH, Step CA and Vault sign in through a linked server
- Make Ed25519 and ECDSA keys, check keys and certificates as you type, and convert PuTTY keys
- Import hosts from a Termix file or SSH config, export them, and share a host by QR code
- Open a host from a `termix-mobile://open` link, for ntfy or Home Assistant (#87)
- Sign in with every login the server lists, including SSO, TOTP and passkeys (passkeys need Termix 26.10.6) (#83)
- Face ID or fingerprint for a server's password, and password manager autofill (#91)
- Servers behind a reverse proxy: extra headers, Cloudflare tokens, basic auth, client certificates and proxy sign in pages
- Pin a server's certificate key, and trust prompts for RDP certificates
- Server plugins with no phone version open inside the app, and Settings, Plugins shows what works where
- Rebuilt Settings with search, text size and row density
- App Lock delays, PIN change and hiding the app in the app switcher
- Split view on tablets, foldable support, a sidebar on wide windows and resizable windows
- Keyboard shortcuts for iPad and Android, hover and right click for mouse and trackpad
- Home screen widgets with no server, a themed Android icon and copyable app logs
- Better screen reader support, large text and reduce motion
- Opt in anonymous usage statistics

### Changed

- The app opens on Home, tap a host to open its terminal and hold it for everything else
- Bottom bar is Home, Hosts, Sessions, Tools and Settings
- Faster with big folders and thousands of hosts, and the app opens without waiting for the server
- Look and theme colors now match Termix on the web and desktop, including the terminal and app icon
- Popups are sheets, and editors open in place with a back button
- The host editor is one page with sections instead of tabs
- Server sign in is kept in secure storage, renewed on its own, and left out of backups
- A failed or dropped connection stays open, says what went wrong and retries with backoff
- The keyboard editor now edits rows and groups, and your 1.x keys move over
- Commands that look like secrets are no longer saved to history
- Needs iOS 16.4 or newer

### Removed

- Keyboard presets and the compact and hint options

### Fixed

- Android no longer trusts any local network certificate in sign in and remote desktop pages
- Sign in, Docker console and remote desktop pages can no longer load other sites
- App logs no longer hold addresses or tokens
- App Lock and Face ID prompts behave when you return to the app (#100)
- Proxy sign ins are kept after a restart and no longer sign you out of Termix (#103)
- Client certificates (mTLS) are sent on every request, socket and relay (#84)
- SSO stays signed in after signing out of a server, and old sign in links can't be reused
- Servers behind Cloudflare Access work after you sign in (#81)
- Saving a sub-host keeps it under its parent
- Terminal settings, environment variables, startup snippets and tmux from Termix 2.9 and newer now apply
- The first letter typed is no longer a capital (#93)
- Copying text no longer freezes the terminal on Android (#101)
- CJK keyboards, voice typing, symbols and hardware keyboards work in the terminal
- The Android icon is no longer cut off
- Large file uploads no longer fail
- Terminals no longer look open but stop responding after the app was away
- Remote desktop reconnects after switching apps (#104)
- RDP keeps its text size on rotation and resolution when the keyboard opens, and asks again after a wrong password

## 1.6.0

The app now follows which Termix plugins are turned on, and RDP asks for credentials when a host has none saved.

### Added

- Hide host actions, editor sections, settings and keyboard tabs for features the server has turned off
- Refresh the server's features on pull to refresh, when the app comes back and when the server reports a feature is off

### Changed

- Renamed Server Stats to Host Metrics, including the home screen widget, to match Termix

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
