# termix-ssh

The phone's own SSH and SFTP engine. A Rust core on [russh](https://github.com/warp-tech/russh) and
[russh-sftp](https://github.com/AspectUnk/russh-sftp), exposed to Kotlin and Swift with
[UniFFI](https://github.com/mozilla/uniffi-rs), wrapped as an Expo module. The local transport in
`src/core/transport` builds on it, so the app can reach hosts with no Termix server.

## What it does

- Logins in core's order: `none` first, then key, password and keyboard-interactive. Keys can be OpenSSH,
  PEM, PKCS8 or PuTTY PPK (v2 and v3), with or without passphrase. Key plus password works. An OpenSSH user
  certificate is tried on its own, like core. Every keyboard-interactive round goes to the app, so TOTP,
  push and saved passwords work like on the server. When nothing fits, the error is
  `authMethodNotAvailable`, so the app can ask for a login
- Host key check before login, with the raw blob hex Termix stores and the `SHA256:` fingerprint; host
  certificates are reported with their CA
- Proxies on the way in (SOCKS4, SOCKS5 with login, HTTP CONNECT, chained) and port knocking (TCP and
  UDP), like core's transport
- Shell with a pty, terminal modes, resize and signals; exec with a timeout and an output cap; streaming
  exec with stdin
- Shell output can skip JS: with `pipeId` the bytes go to the terminal view through `modules/termix-pipe`.
  When the view falls behind, the pipe pauses the Rust reader, the channel window fills and the server
  stops sending
- SFTP: list, stat, lstat, realpath, read link, symlink, mkdir, rmdir, rename, chmod, remove, recursive
  delete (never follows links), small reads and writes, and streamed download and upload with progress
  and resume
- Local, remote and dynamic (SOCKS5) forwards. Stopping a forward closes its live connections too
- Jump hosts (any number of hops), keepalive with interval and count max, and `reconnect()` with the
  login kept in native memory
- Every long call takes an `AbortSignal`; cancelling a login also drops its open prompts
- Key tools for the login editor: `inspectKey`, `convertKeyToOpenssh` and `inspectCertificate`
- Core's algorithm list, plus a legacy set (ssh-rsa, sha1 key exchange, 3des, hmac-sha1) behind
  `allowLegacyAlgorithms` (on by default, like core). Not supported: `sntrup761x25519-sha512`. Agent
  auth, `op://` references and browser sign-ins (OPKSSH, Step CA, Vault) need a Termix server;
  the app names the product when a host uses one

## Telnet and remote desktops

The engine also opens plain TCP for non-SSH hosts, directly, through the proxies, or through an SSH
session (a direct-tcpip channel, so jump hosts work with no forward listener). Each protocol is a cargo
feature (`telnet`, `vnc`, `rdp`, all on by default), so one can be left out to save size.

- `connectTelnet`: Telnet (RFC 854) driven like a shell. It answers BINARY, SGA, ECHO, terminal type and
  window size, escapes IAC and sends a bare CR as CR NUL. A saved login is typed at the first `login:` and
  `password:` prompts. Output can go to a terminal pipe like an SSH shell.
- `openDisplay`: VNC or RDP. Frames go to `modules/termix-display` by frame id and never cross JS; JS sends
  pointer, keys, text, clipboard and resize, and hears size, clipboard and the end. A refused login
  throws `auth`.
  - VNC is a port of the remote desktop plugin's client: RFB 3.3 to 3.8 (macOS 3.889 too), None, VNC
    password and Apple Remote Desktop logins, Raw, CopyRect, Hextile and ZRLE, desktop resize.
  - RDP is [IronRDP](https://github.com/Devolutions/IronRDP) (MIT or Apache-2.0) at the plugin's revision,
    with TLS on rustls and NLA through NTLM. It runs on its own thread because IronRDP's futures are not
    all `Send`. Kerberos, RD Gateway, clipboard, audio and drives are not in yet.

The remote desktop tab uses these when the phone can reach the host, and the server's Guacamole view
otherwise (`src/features/remote-desktop/native`).

Size: the arm64 Android library went from 3.4 MB (0.3.0) to 8.1 MB (0.4.0). Telnet and VNC add about
0.2 MB of that; RDP is the rest. A Windows build with the same profile shows the same split (4.0 MB
without remote protocols, 4.2 MB with Telnet and VNC, 8.8 MB with RDP).

Secrets stay in Rust once a login starts: the config kept for `reconnect()` is wiped when the session
goes, and `ConnectConfig` never prints secrets in logs.

## Use

```ts
import { connect } from "@/modules/termix-ssh";

const session = await connect(
  { host, port: 22, username, password },
  {
    verifyHostKey: async (key) => askUser(key),
    keyboardInteractive: async (round) => askUser(round.prompts),
  },
  { signal },
);
const shell = await session.openShell(
  { cols: 80, rows: 24 },
  { onData: (bytes) => term.write(bytes), onExit: () => {} },
);
await shell.write("ls
");
await session.sftp.download("/var/log/syslog", fileUri, { onProgress, signal });
session.onDisconnect(({ kind, reason }) => {});
```

Errors are `SshError` with a `kind` (`auth`, `authMethodNotAvailable`, `hostKeyRejected`,
`passphraseRequired`, `cancelled`, ...). `isSshEngineAvailable` is false in Expo Go and on web.

## Layout

| Path               | What                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| `rust/`            | The engine crate (`termix_ssh_core`) and its scenario tests                        |
| `bindgen/`         | UniFFI binding generator                                                           |
| `android/`, `ios/` | Expo module glue; `uniffi/` and `ios/Generated/` are generated bindings, committed |
| `index.ts`, `src/` | JS API                                                                             |
| `test-server/`     | Docker OpenSSH servers the tests run against                                       |
| `engine.lock.json` | The engine release this code expects, with sha256 of each archive                  |

## Binaries

The compiled engine is not in git. The SSH engine workflow builds it and publishes a GitHub release
named `termix-ssh-v<version>`. During `expo prebuild` (and so on EAS), `plugins/withTermixSsh.js` runs
`scripts/fetch-ssh-engine.cjs`, which downloads the archives pinned in `engine.lock.json`, checks their
sha256 and unpacks them to `android/src/main/jniLibs` and `ios/TermixSshCore.xcframework`.

A Jest test fails when `rust/` changes without a new release. To ship a Rust change:

1. Bump `version` in `package.json`.
2. Run `scripts/gen-bindings.sh` and commit the bindings (CI checks they are current).
3. Run the SSH engine workflow with publish on, then commit the `engine.lock.json` it attaches to the
   release.

To build locally instead: `scripts/build-android.sh` (needs `ANDROID_NDK_HOME` and `cargo-ndk`) or
`scripts/build-ios.sh` (macOS), then `node scripts/fetch-ssh-engine.cjs --from modules/termix-ssh/dist`.

## Tests

```sh
docker compose -f test-server/compose.yml up -d --build
cd rust && SSH_TEST_DOCKER=1 cargo test --release
```

`rust/tests/scenarios.rs` holds the A4 checks, `rust/tests/engine.rs` the rest (none auth, cancel,
reconnect, SFTP, forwards, proxies, PuTTY keys). Unit tests in `rust/src` need no docker. The JS wrapper
has Jest tests in `tests/modules/termix-ssh`, the local transport in `tests/core/transport/local`.

## Notes for callers

- Long loops (transfers) run inside Rust. Driving them step by step from Kotlin or Swift through UniFFI
  allocates native memory per poll that only GC frees.
- Every socket the engine opens or accepts sets `SO_NOSIGPIPE` on iOS, where SIGPIPE would kill the app.
- Panics unwind and come back as errors, they never abort the app.
