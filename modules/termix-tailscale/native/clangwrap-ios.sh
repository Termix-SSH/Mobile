#!/bin/sh
# Minimal clang wrapper for GOOS=ios c-archive builds (Xcode required).
set -e
SDK=$(xcrun --sdk iphoneos --show-sdk-path)
CLANG=$(xcrun --sdk iphoneos -f clang)
exec "$CLANG" -isysroot "$SDK" -miphoneos-version-min=15.1 -arch arm64 "$@"
