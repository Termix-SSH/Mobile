#!/bin/sh
# Regenerates the committed Kotlin and Swift bindings from the Rust core.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
(cd "$here/rust" && cargo build --lib)
lib=$(ls "$here"/rust/target/debug/libtermix_ssh_core.so "$here"/rust/target/debug/libtermix_ssh_core.dylib \
  "$here"/rust/target/debug/termix_ssh_core.dll 2>/dev/null | head -1)
tmp=$(mktemp -d)
(cd "$here/bindgen" && cargo run -q --release -- generate --library "$lib" --language kotlin --language swift --no-format --out-dir "$tmp")
rm -rf "$here/android/src/main/java/uniffi"
cp -r "$tmp/uniffi" "$here/android/src/main/java/"
cp "$tmp/termix_ssh_core.swift" "$here/ios/Generated/"
rm -rf "$tmp"
