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

Termix Mobile is an SSH client for phones and tablets that works on its own: keep hosts on This device and connect straight from the phone. Link a [Termix](https://github.com/Termix-SSH/Termix) server to sync your hosts, logins and snippets with it. See the [mobile app docs](https://docs.termix.site/mobile).

The terminal, file manager, tunnels, Docker, metrics and services all work straight from the phone. With a server they can also go through its plugins.

Try Termix at [demo.termix.site](https://demo.termix.site/). Any username and password works.

<br />

## Features

- SSH terminal: several sessions in tabs you can rename, drag and swipe between, key rows with a tmux row that you can change per host, snippets with variables and folders that can run on many hosts at once, history with search and suggestions, find, sudo password fill, tmux and screen attach, share links, hardware keyboard shortcuts, dictation and VoiceOver. Tabs reconnect on their own and come back after the app was closed. On Android sessions keep running in the background with a notification; on iOS they reconnect when you come back.
- File manager: browse, edit and move files over SFTP from the phone or through your server. Download and upload with pause and resume, share files in from other apps, edit code with syntax highlighting, and keep a files panel beside the terminal.
- Home: open sessions, quick connect, recent hosts and live cards for your pinned hosts with metrics, Docker and failed services.
- Navigation: one tap on a host opens its terminal, hold it for more. A Tools tab for files, snippets, tunnels, Docker, metrics and services, search across hosts, snippets, actions and settings, and split view on tablets.
- Host metrics: CPU, memory, disk, network, uptime and processes from the phone, plus ports, firewall rules and login history through your server, with history up to a week and server alerts on the hosts screen.
- SSH tunnels: create, start and stop tunnels, set up per host in the host editor.
- Docker: containers, logs, stats, start, stop, restart, a shell in a container and compose stacks, from the phone or through your server.
- Services: systemd and OpenRC services with start, stop and restart, and the journal with live follow. Asks for the sudo password when a change needs root.
- Remote desktop: RDP, VNC and Telnet straight from the phone, or through your server.
- Server plugins: plugins with no phone version, like Homepage, Alerts and Proxmox, open inside the app with the same screens as the web app. Settings, Plugins shows how each one shows in the app.
- Home screen widgets on iOS and Android: open a host, run a snippet or check metrics without opening the app.
- Hosts: folders with drag to reorder, select many at once, saved credentials and keys, host defaults, import and export (Termix files and SSH config), QR sharing, Quick Connect and Wake-on-LAN.
- Accounts: link more than one Termix server and switch between them. Open tabs keep running.
- Sync: each linked server keeps its own encrypted copy on the phone, synced both ways and in the background, so its hosts work offline too. Pick what syncs, merge This device's hosts in on first link, and keep a copy when you unlink. Needs the Sync plugin on the server.
- Reverse proxies: extra headers, Cloudflare service tokens, basic auth, client certificates and proxy sign in pages (Cloudflare Access, Authelia, Authentik).
- Local data: hosts, logins and snippets on This device are saved on the phone in an encrypted database. Export a backup locked with a passphrase, or delete it in Settings.
- Settings: terminal look, keyboard, API keys, active sessions, two-factor, password and account deletion.
- App lock: Face ID, Touch ID or fingerprint, with a PIN as backup.
- Tablets and keyboards: a sidebar and split view on wide screens, resizable windows on iPad and Android, and app wide shortcuts for hardware keyboards.
- Usage statistics: an anonymous daily report, off until you answer the question on first start. See [what is sent](https://docs.termix.site/privacy#mobile-app).

<br />

## Installation

Termix Mobile is available for [Android](https://docs.termix.site/install/apps/android) and [iOS](https://docs.termix.site/install/apps/ios). To link a server, see [linking a server](https://docs.termix.site/mobile/linking).

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
