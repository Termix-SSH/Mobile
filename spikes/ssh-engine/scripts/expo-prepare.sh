#!/bin/sh
# Prepares the Mobile app for one size build: baseline, libssh2 or russh.
# Run from the Mobile repo root after the native slices are built into spikes/ssh-engine/build.
set -eu
variant=$1
platform=$2 # android or ios
spike=spikes/ssh-engine
for v in libssh2 russh; do
  [ "$v" = "$variant" ] || rm -rf "modules/termix-ssh-$v"
done
[ "$variant" = baseline ] && exit 0
m=modules/termix-ssh-$variant
api=$spike/harness/android/api/src/main/kotlin/termix/ssh/api

if [ "$platform" = android ]; then
  vendor=$m/android/src/main/vendor
  rm -rf "$vendor" "$m/android/src/main/jniLibs" && mkdir -p "$vendor/termix/ssh/api" "$m/android/src/main/jniLibs"
  cp "$api/Engine.kt" "$api/Probe.kt" "$vendor/termix/ssh/api/"
  if [ "$variant" = russh ]; then
    mkdir -p "$vendor/termix/ssh/russh"
    cp "$spike/harness/android/russh/src/main/kotlin/termix/ssh/russh/RusshEngine.kt" "$vendor/termix/ssh/russh/"
    cp -r "$spike/russh/generated/kotlin/uniffi" "$vendor/"
    lib=libtermix_ssh_core.so
  else
    mkdir -p "$vendor/termix/ssh/libssh2"
    cp "$spike"/harness/android/libssh2/src/main/kotlin/termix/ssh/libssh2/*.kt "$vendor/termix/ssh/libssh2/"
    lib=libtermix_ssh2.so
  fi
  for abi in arm64-v8a armeabi-v7a x86_64 x86; do
    mkdir -p "$m/android/src/main/jniLibs/$abi"
    cp "$spike/build/android/jniLibs/$abi/$lib" "$m/android/src/main/jniLibs/$abi/"
  done
else
  vendor=$m/ios/Vendor
  rm -rf "$vendor" && mkdir -p "$vendor"
  # One Swift module in the pod, so drop the harness module imports.
  for f in "$spike/harness/ios/Sources/SshApi/Engine.swift" "$spike/harness/ios/Sources/SshApi/Probe.swift"; do
    sed -e '/^import SshApi$/d' "$f" > "$vendor/$(basename "$f")"
  done
  if [ "$variant" = russh ]; then
    sed -e '/^import SshApi$/d' -e 's/SshApi\.Progress/Progress/g' "$spike/harness/ios/Sources/RusshEngine/RusshEngine.swift" > "$vendor/RusshEngine.swift"
    cp "$spike/build/ios/swift/termix_ssh_core.swift" "$vendor/"
    cp -R "$spike/build/ios/TermixSshCore.xcframework" "$vendor/"
  else
    sed -e '/^import SshApi$/d' -e 's/SshApi\.Progress/Progress/g' "$spike/harness/ios/Sources/Libssh2Engine/Libssh2Engine.swift" > "$vendor/Libssh2Engine.swift"
    cp -R "$spike/build/ios/TermixSsh2.xcframework" "$vendor/"
  fi
fi
echo "prepared $variant for $platform"
