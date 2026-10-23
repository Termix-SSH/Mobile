#!/bin/sh
# Builds the Rust core for Android with cargo-ndk.
# Needs ANDROID_NDK_HOME, rustup targets and cargo-ndk (cargo install cargo-ndk).
# Output: ../build/android/jniLibs/<abi>/libtermix_ssh_core.so
set -eu
here=$(cd "$(dirname "$0")" && pwd)
ABIS=${ABIS:-arm64-v8a armeabi-v7a x86_64 x86}
out=$here/../build/android/jniLibs
args=""
for abi in $ABIS; do args="$args -t $abi"; done
start=$(date +%s)
cd "$here/core"
RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384" cargo ndk $args -P 24 -o "$out" build --release --lib
for abi in $ABIS; do echo "$abi $(wc -c < "$out/$abi/libtermix_ssh_core.so") bytes"; done
echo "russh android build took $(( $(date +%s) - start ))s"
