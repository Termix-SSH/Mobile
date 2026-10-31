# Vendored sources, do not edit

Copied unchanged from the tags below. To update, copy the upstream `Sources/` folders again and bump
the versions here, in the podspecs and in `ghostty.lock.json`.

| Directory                         | Upstream                                      | Tag            |
| --------------------------------- | --------------------------------------------- | -------------- |
| `GhosttyKit/`, `GhosttyTerminal/` | https://github.com/Lakr233/libghostty-spm.git | 2.2.2026101502 |
| `DisplayLink/`                    | https://github.com/Lakr233/DisplayLink.git    | 3.0.1          |

Licenses: `LICENSE-libghostty-spm.txt`, `LICENSE-DisplayLink.txt` (both MIT).
`Frameworks/` is filled at prebuild by `scripts/fetch-ghostty.cjs` and is not committed.
SwiftPM's `Bundle.module` is replaced by `../pods/GhosttyTerminal/Bundle+Module.swift`, which reads the
`GhosttyTerminalResources` bundle the podspec makes.
