#!/bin/sh
# Copies test keys and the algorithm list into the Android test APK assets.
set -eu
dst=harness/android/app/src/androidTest/assets
rm -rf "$dst" && mkdir -p "$dst/keys"
cp server/out/* "$dst/keys/"
cp server/algos.json "$dst/"
