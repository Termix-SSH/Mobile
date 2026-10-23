#!/bin/sh
# Builds the Rust core for iOS device and simulator and packs an xcframework. macOS only.
# Output: ../build/ios/TermixSshCore.xcframework and ../build/ios/swift/termix_ssh_core.swift
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out=$here/../build/ios
targets="aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios"
rustup target add $targets >/dev/null
start=$(date +%s)
cd "$here/core"
export IPHONEOS_DEPLOYMENT_TARGET=15.1
for t in $targets; do cargo build --release --lib --target "$t"; done
# bindings from an unstripped host build
cargo build --lib
cd "$here/bindgen"
rm -rf "$here/generated"
cargo run -q --release -- generate --library "$here/core/target/debug/libtermix_ssh_core.dylib" --language swift --no-format --out-dir "$here/generated/swift"

hdr=$out/headers
rm -rf "$out/TermixSshCore.xcframework" "$hdr" "$out/sim"
mkdir -p "$hdr" "$out/sim" "$out/swift"
cp "$here/generated/swift/termix_ssh_coreFFI.h" "$hdr/"
cp "$here/generated/swift/termix_ssh_coreFFI.modulemap" "$hdr/module.modulemap"
cp "$here/generated/swift/termix_ssh_core.swift" "$out/swift/"
lipo -create "$here/core/target/aarch64-apple-ios-sim/release/libtermix_ssh_core.a" \
  "$here/core/target/x86_64-apple-ios/release/libtermix_ssh_core.a" -output "$out/sim/libtermix_ssh_core.a"
xcodebuild -create-xcframework \
  -library "$here/core/target/aarch64-apple-ios/release/libtermix_ssh_core.a" -headers "$hdr" \
  -library "$out/sim/libtermix_ssh_core.a" -headers "$hdr" \
  -output "$out/TermixSshCore.xcframework" >/dev/null
echo "device lib $(wc -c < "$here/core/target/aarch64-apple-ios/release/libtermix_ssh_core.a") bytes"
echo "russh ios build took $(( $(date +%s) - start ))s"
