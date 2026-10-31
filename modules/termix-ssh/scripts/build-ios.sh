#!/bin/sh
# Builds the engine for iOS device and simulator and packs dist/termix-ssh-ios.tar.gz (an xcframework). macOS only.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
out=$here/dist
targets="aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios"
export IPHONEOS_DEPLOYMENT_TARGET=16.4
cd "$here/rust"
for t in $targets; do cargo build --release --lib --target "$t"; done
cargo build --lib
rm -rf "$out/ios" && mkdir -p "$out/ios/headers" "$out/ios/sim"
(cd "$here/bindgen" && cargo run -q --release -- generate --library "$here/rust/target/debug/libtermix_ssh_core.dylib" \
  --language swift --no-format --out-dir "$out/ios/gen")
cp "$out/ios/gen/termix_ssh_coreFFI.h" "$out/ios/headers/"
cp "$out/ios/gen/termix_ssh_coreFFI.modulemap" "$out/ios/headers/module.modulemap"
lipo -create target/aarch64-apple-ios-sim/release/libtermix_ssh_core.a target/x86_64-apple-ios/release/libtermix_ssh_core.a \
  -output "$out/ios/sim/libtermix_ssh_core.a"
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libtermix_ssh_core.a -headers "$out/ios/headers" \
  -library "$out/ios/sim/libtermix_ssh_core.a" -headers "$out/ios/headers" \
  -output "$out/ios/TermixSshCore.xcframework"
tar -czf "$out/termix-ssh-ios.tar.gz" -C "$out/ios/TermixSshCore.xcframework" .
ls -l "$out"
