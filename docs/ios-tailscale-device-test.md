# iOS device testing: userspace Tailscale

This guide covers building a development or signed iOS app with the native
Tailscale archive and checking the end-to-end transport on a real device.

## Prerequisites

- A macOS runner with Xcode and Go 1.24 or newer.
- A Tailscale tailnet containing either the Termix backend or an approved
  subnet router for the backend network.
- A short-lived, preferably tagged and pre-authorized Tailscale auth key.
  Store it only in the app's SecureStore and revoke it after testing.
- A backend URL that the tailnet can reach, for example a Tailscale IP,
  MagicDNS name, or a subnet-routed private address.

The app does not create a system VPN. It joins Tailscale in-process and
forwards the configured backend through a loopback HTTP listener. The user
facing URL remains the configured origin; axios and WebSocket use the local
forward internally.

## Build the native archive

From the repository root:

```bash
npm ci
npm run build:tailscale-ios
```

The command creates:

```text
modules/termix-tailscale/ios/lib/libtermix_ts.a
modules/termix-tailscale/ios/lib/termix_ts.h
```

Build the app only after the archive exists. A clean build without the archive
uses the linkable stub and reports that the native Tailscale implementation is
unavailable; it cannot join a tailnet.

For a local development build, use the normal Expo/EAS development profile
from a macOS runner. The repository workflow also runs the Go archive build
before the iOS prebuild and packaging steps:

```bash
npm run build:tailscale-ios
npx expo prebuild
```

Do not commit the generated archive or generated Xcode/Pods directories.

## Configure the test device

1. Install the resulting development or signed app on the device.
2. Open the server login or Change server flow.
3. Enable **Connect via Tailscale**.
4. Paste a temporary auth key and enter the backend's reachable URL.
5. Continue and wait for the Tailscale join and backend probe to complete.
6. Confirm Settings shows the configured backend URL and indicates the
   localhost forward/Tailscale transport.

Use a backend URL with the correct scheme. For an HTTPS backend, the native
forward performs TLS using the original hostname as SNI and certificate name;
the app-facing listener remains plain HTTP. The device must trust the backend
certificate, including any private CA.

## Smoke-test matrix

Run each applicable case:

| Case                                | Expected result                                                   |
| ----------------------------------- | ----------------------------------------------------------------- |
| Direct HTTP                         | Login and Hosts load without Tailscale.                           |
| Tailscale HTTP                      | Login and Hosts load through the local forward.                   |
| Direct HTTPS                        | Login and Hosts load with the backend certificate trusted.        |
| Tailscale HTTPS                     | Login and Hosts load; no plain-HTTP-to-HTTPS error appears.       |
| HTTPS on a non-standard port        | The configured port is preserved.                                 |
| Cold start with a saved auth key    | Direct/Tailscale choice appears before LAN probes.                |
| Login followed immediately by Hosts | The new forward stays alive and Hosts load once.                  |
| Terminal session                    | The WebSocket uses the same transport and deployment path prefix. |
| Direct selection after Tailscale    | The app stops using the loopback forward and reconnects directly. |
| Logout or shutdown                  | Tailscale forwards and node state are released.                   |

For a deployment mounted below the origin root, verify that both REST and
terminal WebSocket requests retain the path prefix.

## Troubleshooting

- **Native module unavailable:** rebuild the iOS archive and ensure the app
  was packaged after `libtermix_ts.a` and its header were created.
- **Join or authentication failure:** check that the key is valid,
  pre-authorized if required, and permitted by tailnet ACLs.
- **Backend unreachable:** confirm the backend is a Tailscale peer or that an
  approved subnet route exists; a private LAN address alone is not enough.
- **Certificate failure:** install the backend's issuing CA on the device or
  use a certificate whose name matches the configured backend hostname. Do not
  disable native certificate verification.
- **WebSocket failure:** check the backend deployment prefix and confirm the
  terminal request is using the same direct or Tailscale transport as login.

After testing, revoke the temporary auth key and remove the test node from the
tailnet if it is no longer needed.
