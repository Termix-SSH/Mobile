# Changelog

## 2.0.0

Termix Mobile now works with no server. Hosts, logins and snippets stay encrypted on the phone, and the terminal, files, tunnels, Docker, metrics, services and remote desktop connect straight from it. Link one or more Termix servers to sync with them and use their plugins.

### Added

- Home shows your open sessions, quick connect, the hosts you opened last and your pinned hosts with live cards for metrics, Docker and failed services
- A Tools tab for files, snippets, tunnels, Docker, metrics and services: pick a tool, then the host
- Search hosts, snippets, actions and settings from the search button at the top of Home, Hosts and Tools
- Home and Hosts say when your server can't be reached, and the hosts on the phone keep working
- Drag hosts to reorder them inside a folder, in the same order as Termix on the web
- Select many hosts to pin, unpin, move to a folder, open or delete them at once
- Sub-hosts show nested under their parent host, like on the web. Open or close them from the parent's row, pick a parent in the host editor, add a sub-host from a host's menu or move many hosts under one at once. Sub-hosts follow their parent's folder defaults
- Active host filters show under the filter box, and a tap removes one
- Split view on tablets: put two tabs side by side from the tab menu and drag the divider to resize
- Foldables like the iPhone Duo and Galaxy Z Fold: the host list sits on the left half and the terminal on the right, clear of the crease, and split view puts one tab on each half
- Fold the phone like a laptop and the terminal moves to the top half with the keys on the bottom half
- Close all tabs from the tab menu or the connections list
- The Sessions tab shows how many tabs are open and when one needs attention
- Docker on the phone with no server: containers, logs, stats, start, stop, restart, remove and a shell in a container, with sudo when your user can't reach Docker
- See Docker compose stacks, their services and compose files, read only
- Host metrics on the phone with no server: CPU, memory, disk, network, uptime and processes
- Metrics history for the last hour up to a week, saved on the phone or read from the server
- Services: list systemd and OpenRC services, see their status, start, stop and restart them, and read the journal with live follow, on the phone or through the Service Manager plugin
- Turn on Services per host in the host editor
- When a change needs root the app asks for the sudo password, or uses the one saved on the host, and keeps it until you close the app
- Run tunnels on the phone: local, remote and dynamic forwards with start and stop, auto start and retries (#86)
- Choose per host whether tunnels run on the phone or on the server
- Running tunnels show in the Android notification, and iOS tells you when it stopped them
- Tunnels use the saved tunnel list of the Tunnels plugin, with the old host setting for older servers
- See gateways from the Tunnels plugin, read only
- Add hosts from your Tailscale device list when the Tailscale plugin is on
- Answer the Tailscale SSH check from the terminal
- Sign in to hosts with OPKSSH, Step CA or Vault through a linked server, in your browser
- Hosts that need a Termix server to sign in say which product it is when you are on This device
- Wake a host from the phone with Wake-on-LAN, also on This device with no server
- See if hosts are online from the phone when no server reports it
- Themed app icon on Android 13 and newer
- Link more than one Termix server and switch between them from Settings or the top of Home and Hosts
- Open tabs keep running when you switch to another server
- Hosts, logins and snippets on This device are saved on the phone in an encrypted database
- Export your local data to a backup file locked with a passphrase, and restore it later
- Delete local data from Settings
- Open a terminal to hosts on This device with no Termix server: password, key, keyboard-interactive and TOTP, certificates, jump hosts, proxies and port knocking
- Host keys of hosts on This device are checked and saved on the phone, with a warning when a key changes
- PuTTY keys loaded or pasted in the host or login editor are changed to OpenSSH format
- Pick per host whether a linked server's host connects from the phone, through the server, or automatically
- A failed connection says what went wrong and what to try, with buttons to try again or connect the other way
- Features that need a Termix server say so, with a button to connect the host through the server
- A linked server keeps its own copy on the phone and syncs hosts, logins, snippets and settings both ways, also in the background
- Hosts of a linked server work offline and can connect from the phone
- The first time you link a server, merge This device's hosts into it or start with only the server's data. The choice says how many hosts, logins and snippets the phone has
- Unlink a server and keep a copy of your own hosts, logins and snippets on This device, or delete them from the phone
- Pick what syncs for each server, and see changes the server kept over yours with a button to keep yours
- Open a host in the app from a link, like `termix-mobile://open?server=https://termix.example&view=terminal&hostId=12` or `termix-mobile://open?url=` with a Termix web link, for notifications from ntfy or Home Assistant (#87)
- Keep a server's password behind Face ID, Touch ID or a fingerprint, and sign in again with one look when the server signs you out. Turn it off per server under Sync (#91)
- Password managers like Bitwarden, 1Password and Apple Passwords can fill the server address, username, password and one time code (#91)
- Sign in with a passkey or security key (Face ID, fingerprint, NFC or USB keys) through the browser when your server has passkeys on, and say when the sign in was canceled or turned down (needs Termix 26.10.6 or newer) (#83)
- A welcome screen on a new install: use the app with no server, link a server, or import hosts and backups. Each choice says what it does
- Link a server by its name alone: https is added, and the address is checked before anything is saved
- Sign in with every login your server lists: password, LDAP, each SSO provider, TOTP and backup codes, and passkeys or security keys in the browser
- SSO uses the login your phone's browser already has, so it doesn't ask again
- Hosts can have a color and an icon, which sync with Termix (needs Termix 26.10.6 or newer)
- Pick jump hosts in the host editor and change their order
- On a linked server the host editor shows simple settings of plugins the app has no screen for, like Databases or Session Recording
- Make Ed25519 and ECDSA keys on the phone with an optional passphrase, and RSA keys through the server's Credential Tools plugin
- Keys are checked as you type, with the key type, fingerprint and whether the passphrase opens it
- A login's certificate shows who it is for, when it expires and whether it fits the key
- Test connection in the host and login editors logs in from the phone without saving
- The host and login editors ask before you leave with unsaved changes
- Servers behind a reverse proxy: extra headers, Cloudflare service tokens, basic auth, client certificates and the proxy's own sign in page
- Pin a server's certificate key: read it from the server or paste it. A pinned server with a self-signed certificate works, and any other key is refused
- RDP from the phone asks you to trust a computer's certificate the first time and warns when it changes, before the password is sent
- When a server signs you out, the Hosts screen says why and offers the quickest fix
- A new native terminal that is faster, scrolls smoothly and stays responsive when a program prints a lot
- Select text with handles and a magnifier, then copy, paste or select all
- Tap a link in the terminal to open it, with a question first that you can turn off
- All of Termix's terminal themes, a theme that follows the app theme, and a custom theme with your own colors
- JetBrains Mono and Fira Code fonts, with ligatures and Nerd Font icons
- Settings for the cursor style and blink, the bell (sound, flash, vibrate), scrollback and line spacing
- Pinch the terminal to change the font size, and it is kept
- Mouse support for tmux, vim and other programs, by tapping and dragging
- Programs can copy to your clipboard (OSC 52) and show clickable links (OSC 8); reading the clipboard asks first
- Pasting text that could run commands asks first, and paste works with bracketed paste
- Screen readers read new terminal output, and the terminal follows the system text size
- Option sends Alt on iPad hardware keyboards when you turn it on, and Cmd+. sends Escape
- A Terminal tab in the host editor for the theme, font, cursor, bell, scrollback, startup snippet, keepalive, environment variables and terminal behavior of one host
- A sudo password field in the host editor
- Snippets work on This device, and the snippets panel in the terminal has folders and search
- Snippets fill in $HOST, $USER, $PORT and $NAME, and ask for $INPUT_1 style values before they run
- Long press a snippet to insert it without running or to copy it
- Mark a snippet as a note so it is pasted without running
- An option to confirm before a snippet runs
- Key rows above the keyboard in groups: Main, Nav, Symbols, Ctrl and tmux, with the tmux prefix, splits, windows, panes and copy mode. Tap the row button for the next row, hold it to pick one
- Hold a key with a dot in its corner for more keys, like _ = + on the minus key
- Shift in the key row stays on for the next key like Ctrl and Alt, and a quick double tap keeps it on
- The terminal offers to fill the saved password at password prompts, and the sudo password at sudo prompts when the host turns that on. Pick Always fill to stop asking for that host
- Find text in the terminal and its scrollback from the Find key, with the count and next and previous. Match case, whole word and regex on Android
- Open tmux for a host from its Terminal tab: it attaches to the only session, starts one when there is none and asks when there are several, also on This device
- The tmux Windows key lists the session's windows to switch between them
- Tap the open tab for its menu: rename it, open another tab on the same host, move it, find, tmux windows, key rows for that host and a share link
- A host can have its own key rows
- Hold a tab to drag it to a new place, and swipe in from the left or right edge to go to the next tab
- Tabs show the title the program sets when the host turns that on
- Share a link to a terminal that runs through the server, when the server has the Session Sharing plugin
- Long press or double tap a word in the terminal to select it, and scroll the history with two fingers, also while a program uses the mouse
- More in the terminal's long press menu opens the tab's menu
- Hardware keyboard shortcuts for a new tab, closing a tab, the next or previous tab, tabs 1 to 9, find and font size. The list is in Settings, Keyboard
- Search the command history, and long press a command to run, copy or delete it
- Past commands that start with what you type can show above the keys, if you turn it on
- Command history of a linked server shows on the phone, and commands typed on the phone show in Termix
- The startup snippet fills in $HOST, $USER, $PORT and $NAME and runs once the shell shows its prompt
- Open sessions keep running in the background on Android, with a notification that lists them and a Disconnect all button
- Settings has a Background sessions section with the battery and notification settings Android needs, and says what iOS allows
- Tabs come back after the app was closed. Server sessions pick up where they were, and a tab on This device says when the old shell is gone
- Each tab shows when it is reconnecting, offline or failed, with a countdown and a Reconnect now button
- What you type while a tab reconnects is kept and sent once it is back, and you can discard it
- After a reconnect the terminal goes back into its tmux session, or GNU screen on hosts without tmux
- Connection log in the tab menu, ready to copy into a bug report
- Switching between Wi-Fi and mobile data, or a VPN going up or down, checks the connection and reconnects right away
- A Tailscale host that can't be reached says to check that Tailscale is connected
- Low power mode makes the app check connections less often
- The file manager works on This device and on hosts that connect from the phone, over SFTP, with no server needed
- Download files and whole folders, and upload many files at once, with progress, pause, resume and cancel
- Downloads go to Termix in the Files app on iOS, and to any folder you pick on Android
- Share files and photos from other apps to a host and folder of your choice
- A code editor with syntax highlighting, find, text size and line wrap. Big files ask first
- Preview images and videos, PDFs on iOS, and open any file in another app
- Copy, move, cut and paste, permissions, properties with owner and folder size, symbolic links and the host's trash
- A files panel beside the terminal on tablets, and Files here in the tab menu on phones. It follows the terminal's folder and can cd the terminal to the folder on screen
- Settings, Files for the trash prompt, transfers at once, hidden files, the editor and the files panel
- Run a snippet on several hosts at once without opening a terminal, from the phone or through the server, and see each result
- Give a snippet target hosts, so they are one tap away and show on the web too
- Import and export snippets as the same JSON file the web app uses
- Host defaults: new hosts start from your defaults, the folder's and the server's, and a host keeps any value you set on it. Edit yours in Settings, Host defaults
- Import hosts from a Termix host file or an SSH config, and export hosts with or without passwords and keys, in Settings, Import and export
- Share a host as a QR code or link and scan one from another phone
- Quick Connect reads user@host:port and can save the host
- Telnet hosts connect straight from the phone, with no Termix server needed, and open in the terminal with its key rows and find
- RDP and VNC hosts connect straight from the phone, with no Termix server needed, through jump hosts and proxies too. Touch and trackpad modes, held mouse buttons, pinch zoom, two finger scroll, hardware keyboards and clipboard paste work, and RDP follows the screen when you rotate. The server's remote desktop view is still used when the host connects through the server
- A refused RDP or VNC login from the phone asks for the login again right away
- Settings, Plugins lists the plugins on your server with their version, whether they are on, and if they show in the app, in a web view or not at all. Everything lists every feature and plugin and says if it works on the phone or needs the server
- A plugin made for a newer or older version of the app says to update the app or the plugin, instead of opening a broken screen
- Server plugins with no phone version, like Homepage, Alerts and Proxmox, open inside the app with the same screens as the web app
- Plugin screens about a host open from the host's menu as a tab; the others are listed on Home and Tools under From your server and in Settings, Plugins
- Plugin screens follow the app's theme, work behind proxies and client certificates, and only reach their own plugin on your server
- An open tab of a plugin an admin turned off says so, and comes back when the plugin is on again
- Settings is rebuilt in sections: accounts and sync, appearance, terminal, keyboard, security, notifications, privacy, plugins, backup and about
- Search settings from the top of Settings or the search button
- Choose text size and row density
- App Lock can lock right away or after 15 seconds, 1 minute or 5 minutes, and you can change the PIN
- Hide Termix in the app switcher, with or without App Lock
- App Lock waits 30 seconds after 5 wrong PINs
- Copy or share the latest app logs from Settings, About and logs
- Clear your recent hosts
- A sidebar instead of the bottom bar on tablets and wide windows, with the host list beside open sessions on large screens. A button in the tab bar hides or shows it. A phone held sideways gets a slim rail and full screen sessions
- The app follows window size changes on iPad (resizable windows) and on Android tablets, foldables and desktop mode without dropping sessions
- A compact key row when the window is short, like a phone held sideways
- App wide keyboard shortcuts on iPad (Cmd K, Cmd /, Cmd Opt 1 to 4, Cmd ,) and on Android (Ctrl Shift K, /, N, comma and Ctrl Alt 1 to 4) with a shortcut sheet in Settings, Keyboard
- Hover highlights and right click menus for mouse and trackpad
- Home screen widgets work with no server, show hosts and snippets from this device and follow the app theme
- Screen readers name every button, read toasts and errors aloud, and stay inside sheets and the App Lock screen
- Large system text sizes are followed, up to twice the normal size
- Reduce motion turns off slide animations and the reconnecting pulse
- Share anonymous usage statistics to help improve the app: off until you answer the first-run question, with a switch, a preview of the next report and an id reset in Settings

### Changed

- The app opens on Home
- Tap a host to open its terminal. Hold it for everything else, like files, Docker, pin or edit
- The bottom bar has Home, Hosts, Sessions, Tools and Settings, and the account switcher is at the top of Home and Hosts
- Snippets moved from Settings to Tools, and logins, Tailscale devices and refresh moved into the Hosts menu
- The default host order is the order you set, then name
- Docker and host metrics only go through the server when the host connects through it, and the cards and screens stop asking the host while the app is in the background
- The file list scrolls smoothly in folders with thousands of files and remembers where you were in each folder
- Big folders sort much faster, and searching files or hosts waits until you stop typing
- The host list stays smooth with thousands of hosts while their status updates
- The app opens without waiting for the update check or the server
- Server terminals use less of the phone's time per line of output
- Text, warnings and errors are readable in every theme and with any accent color
- Your server sign in is now kept in the phone's secure storage
- You stay signed in to a linked server and the app renews the session on its own, so you are not asked for your second factor again
- Secrets in the phone's secure storage stay on this device and are left out of iCloud and phone backups
- Android backups and phone to phone transfers no longer include app data
- Theme colors now match Termix on the web and desktop exactly
- The terminal, keyboard bar and tab bar follow the chosen theme instead of always being dark
- The theme picker shows the same swatches as Termix
- Buttons, inputs, switches, tabs, lists and toasts now look the same as in Termix
- Popups are now sheets that slide up from the bottom, and confirmations use them instead of system alerts
- The host, login, file and key editors open in place with a back button instead of as popups
- The host editor is one page with sections for each protocol and feature instead of tabs, and tags are added one at a time
- Credentials are called logins everywhere in the app
- The iOS app icon, including the dark and tinted versions, now uses the same logo as Termix on the web and desktop
- Needs iOS 16.4 or newer
- A terminal that fails to connect stays open with the error instead of closing
- A dropped connection tries again up to ten times with a growing wait, and waits for the network while the phone is offline
- A server session opened on another device stays as a tab with a button to bring it back here
- The keyboard editor now edits rows and groups with drag to reorder, custom keys that type text, run a command or send Ctrl, and the tmux prefix. Your keys from 1.x move over
- Ctrl, Alt and Shift from the key row also work in the full keys panel
- Commands that look like they hold a password, token or key, and anything typed at a password prompt, are no longer saved to history, like in Termix

### Removed

- Keyboard presets and the compact and hint options. The new rows cover them

### Fixed

- Android no longer trusts any certificate from a server on the local network in sign in and remote desktop pages. Pin the server's key instead
- The sign in page only takes a session from your server's own pages
- Docker console and remote desktop pages can no longer load other sites
- App logs no longer hold server addresses, host addresses or tokens
- The keyboard no longer stays open over the App Lock PIN pad when you come back to the app (#100)
- Face ID asks for you when you return to a locked app
- Face ID prompts no longer lock the app again
- A reverse proxy asking you to sign in again no longer signs you out of Termix
- A proxy sign in like Authelia or Authentik is kept after the app restarts, and the app asks you to sign in to the proxy again when it runs out instead of making you add the server again (#103)
- A client certificate (mTLS) is sent on every request, socket and SSH relay, including file uploads and downloads on iPhone and remote desktop through the server (#84)
- Signing in through the browser keeps your SSO login. Signing out of one server no longer makes the next sign in forget it, and Android uses the system browser after a sign out too, so passkeys work there
- A sign in link from an older try can no longer finish a sign in, and each link works once
- Servers behind Cloudflare Access work after you sign in: when Access wants a sign in, the app opens it instead of saying it can't reach Termix (#81)
- Saving a sub-host from the app no longer takes it out from under its parent host
- Terminal settings saved on a host in Termix 2.9 and newer are now used on the phone
- A host with tmux turned on in Termix no longer hangs when the host has more than one tmux session
- A host's environment variables and startup snippet from Termix 2.9 and newer now apply in the terminal
- The first letter typed in the terminal is no longer a capital (#93)
- Copying text no longer freezes the terminal on Android (#101)
- Japanese, Chinese and Korean keyboards and voice typing now work in the terminal
- Space, "=" and other symbols type right on every keyboard
- Hardware keyboards on Android and iPad send arrows, Tab, Esc, F keys and Ctrl combos to the terminal
- The Android app icon is no longer cut off and now uses the same logo and color as Termix on the web and desktop
- The splash screen uses the same logo and color as the app icon
- Uploading a large file in the file manager no longer fails
- Coming back to the app after a while no longer leaves a terminal that looks open but does not respond
- Remote desktop no longer freezes after switching to another app, it reconnects on its own (#104)
- RDP text no longer turns tiny after rotating the phone or tablet
- Opening the keyboard no longer changes the RDP resolution, the desktop just fits the space left
- RDP hosts set to ask for a login ask again after a wrong password instead of failing

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
