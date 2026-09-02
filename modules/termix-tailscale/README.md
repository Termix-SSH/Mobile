# termix-tailscale

Userspace Tailscale for Termix Mobile (official `tailscale.com/tsnet`), exposed as an Expo native module.

**Not a system VPN.** The app joins a tailnet inside the process, then opens a **localhost TCP forward** to the private Termix origin. Existing axios / WebSocket code talks to `http://127.0.0.1:<port>`.

## Build native library

Requires Go 1.24+ and, for device builds, Xcode / Android NDK.

```bash
# Host (smoke-compile)
npm run build:tailscale-host

# iOS device archive → modules/termix-tailscale/ios/lib/libtermix_ts.a
npm run build:tailscale-ios

# Android arm64-v8a .so (set ANDROID_NDK_HOME or ANDROID_NDK_ROOT)
npm run build:tailscale-android
```

If the Go library is missing, iOS and Android link a **stub** that returns clear errors so direct mode still builds and the JS UI can show “needs native build”.

## JS API

```ts
import {
  isTermixTailscaleAvailable,
  configureTermixTailscale,
  upTermixTailscale,
  startTermixTailscaleForward,
  closeTermixTailscale,
} from "termix-tailscale";
```

Higher-level helpers live in `app/utils/tailscaleConnect.ts` (auth key in SecureStore, URL parse, rehydrate on boot).

## Auth

Use a Tailscale **auth key** (`tskey-auth-…`), preferably one-off / short-lived / tagged. Do not embed reusable keys in the binary.

## Notes

- Prefer remote `http://100.x.x.x:PORT` or MagicDNS. Raw `192.168.x` needs an approved **subnet route**.
- The app-facing localhost transport is plain HTTP. HTTP targets are relayed
  directly; HTTPS targets are terminated by the native forward with the remote
  hostname as TLS server name, so certificates and non-standard HTTPS ports work
  without validating a certificate for `127.0.0.1`.
- iOS and Android both use the same Go forward implementation; build the platform-native archive/library before packaging the app.
- Android builds target `arm64-v8a`; the Makefile selects the NDK host tag for
  Darwin or Linux and accepts `ANDROID_NDK_HOST_TAG` when a custom layout is
  required.
