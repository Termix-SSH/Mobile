#!/bin/sh
# Builds the Android native libraries from source for the F-Droid build, instead of
# downloading the prebuilt ones that fetch-ssh-engine.cjs and fetch-ghostty.cjs use.
#
#   sh scripts/build-native-fdroid.sh
#
# Needs: ANDROID_NDK_HOME (r27), rustup with the four Android targets, cargo-ndk 4.1.2,
# zig 0.15.2 on PATH, git, node, curl, unzip. GHOSTTY_SRC may point at a ghostty
# checkout at the commit in ghostty.lock.json, else it is cloned into build/ghostty.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
ssh_module=$root/modules/termix-ssh
term_module=$root/modules/termix-terminal

NERD_FONTS_VERSION=v3.4.0
NERD_FONTS_SHA256=8e617904b980fe3648a4b116808788fe50c99d2d495376cb7c0badbd8a564c47

# SSH engine
sh "$ssh_module/scripts/build-android.sh"
jni=$ssh_module/android/src/main/jniLibs
rm -rf "$jni" && mkdir -p "$jni"
cp -R "$ssh_module/dist/jniLibs/." "$jni/"

# libghostty-vt
commit=$(node -p "require('$term_module/ghostty.lock.json')['libghostty-vt'].commit")
src=${GHOSTTY_SRC:-$root/build/ghostty}
if [ ! -d "$src/.git" ]; then
  mkdir -p "$(dirname "$src")"
  git clone https://github.com/ghostty-org/ghostty.git "$src"
fi
git -C "$src" checkout --detach "$commit"

vendor=$term_module/android/vendor
rm -rf "$vendor" && mkdir -p "$vendor/arm64-v8a" "$vendor/x86_64" "$vendor/fonts"
for pair in arm64-v8a:aarch64 x86_64:x86_64; do
  abi=${pair%%:*}
  arch=${pair##*:}
  (cd "$src" && zig build -Demit-lib-vt -Dtarget=$arch-linux-android -Dsimd=false \
    -Doptimize=ReleaseFast --prefix "out-$abi")
  cp "$src/out-$abi/lib/libghostty-vt.a" "$vendor/$abi/"
done
cp -R "$src/out-arm64-v8a/include" "$vendor/include"

# Symbols only Nerd Font for private use glyphs
tmp=$(mktemp -d)
curl -sLo "$tmp/nerd.zip" \
  "https://github.com/ryanoasis/nerd-fonts/releases/download/$NERD_FONTS_VERSION/NerdFontsSymbolsOnly.zip"
echo "$NERD_FONTS_SHA256  $tmp/nerd.zip" | sha256sum -c -
unzip -oq "$tmp/nerd.zip" -d "$tmp/nerd"
cp "$tmp/nerd/SymbolsNerdFontMono-Regular.ttf" "$vendor/fonts/"
cp "$tmp/nerd/LICENSE" "$vendor/fonts/NERD-FONTS-LICENSE"
rm -rf "$tmp"

# Same marker the download script writes, so a later prebuild does not refetch over it
echo "built-from-source" > "$vendor/.sha256"
