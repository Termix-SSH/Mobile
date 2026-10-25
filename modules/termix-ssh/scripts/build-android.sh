#!/bin/sh
# Builds the engine for Android and packs dist/termix-ssh-android.tar.gz.
# Needs ANDROID_NDK_HOME, the four Android rustup targets and cargo-ndk.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
out=$here/dist
rm -rf "$out/jniLibs" && mkdir -p "$out/jniLibs"
cd "$here/rust"
RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384 ${EXTRA_RUSTFLAGS:-}" cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -t x86 -P 24 \
  -o "$out/jniLibs" build --release --lib
tar -czf "$out/termix-ssh-android.tar.gz" -C "$out/jniLibs" .
ls -l "$out"/jniLibs/*/
