<div align="center">

<img src="https://termix.site/img/logo.svg" width="120" alt="Termix Logo" />

<h1>Termix Mobile</h1>

<p>SSH client for phones and tablets, with or without a Termix server</p>

<p>
  <img src="https://img.shields.io/github/stars/Termix-SSH/Mobile?style=flat&label=Stars&color=F39044&labelColor=1a1a1a" />
  <img src="https://img.shields.io/github/forks/Termix-SSH/Mobile?style=flat&label=Forks&color=F39044&labelColor=1a1a1a" />
  <img src="https://img.shields.io/github/v/release/Termix-SSH/Mobile?style=flat&label=Release&color=F39044&labelColor=1a1a1a" />
  <a href="https://discord.gg/jVQGdvHDrf"><img alt="Discord" src="https://img.shields.io/discord/1347374268253470720?color=F39044&labelColor=1a1a1a" /></a>
  <a href="https://donate.termix.site/"><img alt="Donate" src="https://img.shields.io/badge/Donate-Support%20Termix-F39044?style=flat&labelColor=1a1a1a" /></a>
</p>

<p>
  <a href="https://donate.termix.site/"><img alt="Donations this month" src="https://img.shields.io/badge/dynamic/json?style=for-the-badge&label=Donations%20this%20month&query=%24.fiatTotal&prefix=%24&url=https%3A%2F%2Ftermix.site%2Fdonation-snapshot.json&color=F39044&labelColor=1a1a1a" /></a>
</p>

</div>

<br />

## Overview

Termix Mobile is an SSH client for phones and tablets. It works on its own with no server, keeping hosts, logins and snippets in an encrypted database on the phone and connecting straight from it. Link one or more [Termix](https://github.com/Termix-SSH/Termix) servers to sync with them, reach hosts through them and use their plugins. See the [mobile app docs](https://docs.termix.site/mobile).

Try Termix at [demo.termix.site](https://demo.termix.site/). Any username and password works.

<br />

## Screenshots

<div align="center">

<img src="./.github/readme/home.jpg" width="200" alt="Home" />
<img src="./.github/readme/hosts.jpg" width="200" alt="Hosts" />
<img src="./.github/readme/terminal.jpg" width="200" alt="Terminal" />
<img src="./.github/readme/files.jpg" width="200" alt="File manager" />

<img src="./.github/readme/metrics.jpg" width="200" alt="Host metrics" />
<img src="./.github/readme/docker.jpg" width="200" alt="Docker" />
<img src="./.github/readme/themes.jpg" width="200" alt="Themes" />
<img src="./.github/readme/snippets.jpg" width="200" alt="Snippets" />

<img src="./.github/readme/tablet.jpg" width="816" alt="Split view on a tablet" />

</div>

<br />

## Features

- No server needed: hosts, logins and snippets are saved on the phone in an encrypted database. Export a backup locked with a passphrase, or delete it all in Settings.
- Servers: link more than one Termix server and switch between them while open tabs keep running. Each server keeps its own encrypted copy on the phone, synced both ways and in the background, so its hosts work offline too. Needs the Sync plugin on the server. Each host can connect from the phone, through the server or pick on its own.
- Terminal: a fast native terminal with smooth scrolling, selection, links and mouse support. Themes, fonts with ligatures and pinch to zoom, set globally or per host. Key rows in groups (Main, Nav, Symbols, Ctrl, tmux) with custom keys per host, find, tmux attach, password and sudo fill, history search and share links.
- Tabs: rename, drag, swipe and split them. Sessions keep running in the background on Android, tabs come back after the app is closed, and a dropped connection retries and keeps what you typed.
- File manager: browse, edit and move files over SFTP from the phone or through your server. Transfers with pause and resume, share files in from other apps, a code editor, previews and a files panel beside the terminal.
- Home: open sessions, quick connect, recent hosts and live cards for pinned hosts with metrics, Docker and services.
- Tools: host metrics with history, Docker containers, logs and compose stacks, systemd and OpenRC services with the journal, tunnels (local, remote and dynamic) and snippets that run on many hosts at once.
- Remote desktop: RDP, VNC and Telnet straight from the phone, or through your server.
- Hosts: folders with drag to reorder, select many, colors and icons, jump hosts, host defaults, import and export (Termix files and SSH config), QR sharing, Wake-on-LAN, host status and Tailscale.
- Keys: make Ed25519 and ECDSA keys, check keys and certificates as you type and convert PuTTY keys. OPKSSH, Step CA and Vault work through a linked server.
- Sign in: every login the server offers, including SSO, TOTP and passkeys, plus servers behind a reverse proxy (extra headers, Cloudflare tokens, basic auth, client certificates and proxy sign in pages).
- Server plugins: plugins with no phone version, like Homepage, Alerts and Proxmox, open inside the app with the same screens as the web app.
- Search: one palette for hosts, snippets, actions and settings.
- Tablets and keyboards: a sidebar and split view on wide screens, foldable support, resizable windows, keyboard shortcuts and mouse or trackpad support.
- Widgets: open a host, run a snippet or check metrics from the home screen on iOS and Android.
- App lock: Face ID, Touch ID or fingerprint with a PIN as backup, and the app hidden in the app switcher.
- Usage statistics: an anonymous daily report, off until you answer the question on first start. See [what is sent](https://docs.termix.site/privacy#mobile-app).

<br />

## Installation

Termix Mobile is available for [Android](https://docs.termix.site/install/apps/android) and [iOS](https://docs.termix.site/install/apps/ios) (iOS 16.4 or newer). To link a server, see [linking a server](https://docs.termix.site/mobile/linking).

<br />

## Sponsors

For a paid sponsor spot, email [mail@termix.site](mailto:mail@termix.site).

<!-- SPONSORS:START -->

<div align="center">

<br />

<a href="https://www.blacksmith.sh/">
  <img src="https://termix.site/img/sponsors/blacksmith.svg" height="40" alt="Blacksmith" />
</a>
&nbsp;&nbsp;&nbsp;
<a href="https://www.cloudflare.com/">
  <img src="https://termix.site/img/sponsors/cloudflare.png" height="40" alt="Cloudflare" />
</a>
&nbsp;&nbsp;&nbsp;
<a href="https://akamai.com/">
  <img src="https://termix.site/img/sponsors/akamai.svg" height="40" alt="Akamai" />
</a>
&nbsp;&nbsp;&nbsp;
<a href="https://aws.amazon.com/">
  <img src="https://termix.site/img/sponsors/aws.png" height="40" alt="AWS" />
</a>
&nbsp;&nbsp;&nbsp;
<a href="https://rackgenius.com/">
  <img src="https://termix.site/img/sponsors/rackgenius.png" height="40" alt="Rack Genius" />
</a>
&nbsp;&nbsp;&nbsp;
<a href="https://ginernet.com/">
  <img src="https://termix.site/img/sponsors/ginernet.png" height="40" alt="Ginernet" />
</a>
&nbsp;&nbsp;&nbsp;
<a href="https://www.hetzner.com/?mtm_campaign=termix&mtm_medium=referral&mtm_content=sponsoring_link">
  <img src="https://termix.site/img/sponsors/hetzner.png" height="40" alt="Hetzner" />
</a>

</div>

<!-- SPONSORS:END -->

<br />

## Support

Bugs and ideas for the mobile app go in this repo: [report a bug](https://github.com/Termix-SSH/Mobile/issues/new?template=bug_report.yml) or [request a feature](https://github.com/Termix-SSH/Mobile/issues/new?template=feature_request.yml). Problems with the Termix server or a plugin go in the [Termix repo](https://github.com/Termix-SSH/Termix/issues/new/choose) or that plugin's repo. Not sure where it goes? Open it in Termix and it will be moved.

Add as much detail as you can, in English if possible.

For discussions and questions, join the [Discord](https://discord.gg/jVQGdvHDrf) server.

<br />

## License

Apache License 2.0. See [LICENSE](LICENSE).
