#!/bin/sh
# Prints a sha256 for every library build-native-fdroid.sh made, sorted by path.
# Run it after two builds and diff the output to see if the build is reproducible.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root/modules"
find termix-ssh/android/src/main/jniLibs termix-terminal/android/vendor \
  -type f \( -name '*.so' -o -name '*.a' \) | sort | xargs sha256sum
