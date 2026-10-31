#!/bin/sh
# Builds the Android native libraries from source for the F-Droid build, instead of
# downloading the prebuilt ones that fetch-ssh-engine.cjs and fetch-ghostty.cjs use.
#
#   sh scripts/build-native-fdroid.sh fetch   download every source and crate (network)
#   sh scripts/build-native-fdroid.sh build   build offline from what fetch got
#   sh scripts/build-native-fdroid.sh         both
#
# Needs: ANDROID_NDK_HOME (r27), rustup with the four Android targets, cargo-ndk 4.1.2,
# zig 0.15.2 on PATH, git, node, curl, unzip. GHOSTTY_SRC may point at a ghostty
# checkout, else it is cloned into build/ghostty. The output does not depend on the
# build path or the time, so two builds give the same files (scripts/native-hashes.sh).
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
ssh_module=$root/modules/termix-ssh
term_module=$root/modules/termix-terminal
mode=${1:-all}

NERD_FONTS_VERSION=v3.4.0
NERD_FONTS_SHA256=8e617904b980fe3648a4b116808788fe50c99d2d495376cb7c0badbd8a564c47

commit=$(node -p "require('$term_module/ghostty.lock.json')['libghostty-vt'].commit")
src=${GHOSTTY_SRC:-$root/build/ghostty}
cache=$root/build/zig-cache
font=$root/build/nerd-fonts

fetch() {
  (cd "$ssh_module/rust" && cargo fetch --locked)
  if [ ! -d "$src/.git" ]; then
    mkdir -p "$(dirname "$src")"
    git clone https://github.com/ghostty-org/ghostty.git "$src"
  fi
  git -C "$src" checkout --detach "$commit"
  # ghostty pulls its own packages while it builds, so get them now
  (cd "$src" && zig build --fetch --global-cache-dir "$cache")
  rm -rf "$font" && mkdir -p "$font"
  curl -sLo "$font.zip" \
    "https://github.com/ryanoasis/nerd-fonts/releases/download/$NERD_FONTS_VERSION/NerdFontsSymbolsOnly.zip"
  echo "$NERD_FONTS_SHA256  $font.zip" | sha256sum -c -
  unzip -oq "$font.zip" -d "$font"
  rm -f "$font.zip"
}

build() {
  export CARGO_NET_OFFLINE=true
  export CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
  export SOURCE_DATE_EPOCH=$(git -C "$root" log -1 --format=%ct)
  export EXTRA_RUSTFLAGS="--remap-path-prefix=$root=/src --remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=/cargo --remap-path-prefix=${RUSTUP_HOME:-$HOME/.rustup}=/rustup -C link-arg=-Wl,--build-id=none"

  # SSH engine
  sh "$ssh_module/scripts/build-android.sh"
  jni=$ssh_module/android/src/main/jniLibs
  rm -rf "$jni" && mkdir -p "$jni"
  cp -R "$ssh_module/dist/jniLibs/." "$jni/"

  # libghostty-vt
  vendor=$term_module/android/vendor
  rm -rf "$vendor" && mkdir -p "$vendor/arm64-v8a" "$vendor/x86_64" "$vendor/fonts"
  for pair in arm64-v8a:aarch64 x86_64:x86_64; do
    abi=${pair%%:*}
    arch=${pair##*:}
    rm -rf "$src/out-$abi"
    (cd "$src" && zig build -Demit-lib-vt -Dtarget=$arch-linux-android -Dsimd=false \
      -Doptimize=ReleaseFast --global-cache-dir "$cache" --prefix "out-$abi")
    cp "$src/out-$abi/lib/libghostty-vt.a" "$vendor/$abi/"
  done
  cp -R "$src/out-arm64-v8a/include" "$vendor/include"
  cp "$font/SymbolsNerdFontMono-Regular.ttf" "$vendor/fonts/"
  cp "$font/LICENSE" "$vendor/fonts/NERD-FONTS-LICENSE"

  # Same marker the download script writes, so a later prebuild does not refetch over it
  echo "built-from-source" > "$vendor/.sha256"
}

case "$mode" in
  fetch) fetch ;;
  build) build ;;
  all) fetch && build ;;
  *) echo "usage: $0 [fetch|build]" >&2; exit 2 ;;
esac
