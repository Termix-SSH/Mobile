#!/bin/sh
# Builds OpenSSL, libssh2 and the C core for iOS device and simulator and packs an xcframework. macOS only.
# Output: ../build/ios/TermixSsh2.xcframework
set -eu
here=$(cd "$(dirname "$0")" && pwd)
OPENSSL=${OPENSSL_VERSION:-3.5.9}
LIBSSH2=${LIBSSH2_VERSION:-1.11.1}
MIN=15.1
work=${WORK:-$here/build/ios-work}
out=$here/../build/ios
mkdir -p "$work" "$out"
[ -d "$work/openssl-$OPENSSL" ] || curl -sSL "https://github.com/openssl/openssl/releases/download/openssl-$OPENSSL/openssl-$OPENSSL.tar.gz" | tar xz -C "$work"
[ -d "$work/libssh2-$LIBSSH2" ] || curl -sSL "https://libssh2.org/download/libssh2-$LIBSSH2.tar.gz" | tar xz -C "$work"
jobs=$(sysctl -n hw.ncpu)
start=$(date +%s)

build() { # name sdk arch openssl-target
  name=$1 sdk=$2 arch=$3 ossl=$4
  prefix=$work/prefix/$name
  sysroot=$(xcrun --sdk "$sdk" --show-sdk-path)
  if [ "$sdk" = iphoneos ]; then minflag="-miphoneos-version-min=$MIN"; else minflag="-mios-simulator-version-min=$MIN"; fi
  cflags="-arch $arch -isysroot $sysroot $minflag -Os"
  if [ ! -f "$prefix/lib/libcrypto.a" ]; then
    rm -rf "$work/ossl-$name" && cp -r "$work/openssl-$OPENSSL" "$work/ossl-$name"
    (cd "$work/ossl-$name" && CC="xcrun --sdk $sdk clang" CFLAGS="$cflags" ./Configure "$ossl" no-shared no-tests no-apps \
      no-docs no-engine no-module no-legacy no-async --prefix="$prefix" --libdir=lib >/dev/null \
      && make -j"$jobs" build_libs >/dev/null && make install_dev >/dev/null)
  fi
  if [ ! -f "$prefix/lib/libssh2.a" ]; then
    cmake -S "$work/libssh2-$LIBSSH2" -B "$work/ssh2-$name" -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_SYSROOT="$sdk" \
      -DCMAKE_OSX_ARCHITECTURES="$arch" -DCMAKE_OSX_DEPLOYMENT_TARGET=$MIN -DCRYPTO_BACKEND=OpenSSL \
      -DOPENSSL_ROOT_DIR="$prefix" -DOPENSSL_INCLUDE_DIR="$prefix/include" -DOPENSSL_CRYPTO_LIBRARY="$prefix/lib/libcrypto.a" \
      -DOPENSSL_SSL_LIBRARY="$prefix/lib/libssl.a" -DOPENSSL_USE_STATIC_LIBS=TRUE -DBUILD_SHARED_LIBS=OFF \
      -DBUILD_EXAMPLES=OFF -DBUILD_TESTING=OFF -DENABLE_ZLIB_COMPRESSION=OFF -DCMAKE_BUILD_TYPE=MinSizeRel \
      -DCMAKE_INSTALL_PREFIX="$prefix" >/dev/null
    cmake --build "$work/ssh2-$name" -j >/dev/null && cmake --install "$work/ssh2-$name" >/dev/null
  fi
  xcrun --sdk "$sdk" clang $cflags -I"$prefix/include" -I"$here/core" -c "$here/core/termix_ssh2.c" -o "$work/core-$name.o"
  libtool -static -o "$work/libtermix_ssh2-$name.a" "$work/core-$name.o" "$prefix/lib/libssh2.a" \
    "$prefix/lib/libssl.a" "$prefix/lib/libcrypto.a" 2>/dev/null
}

build device iphoneos arm64 ios64-xcrun
build sim-arm64 iphonesimulator arm64 iossimulator-arm64-xcrun
build sim-x86_64 iphonesimulator x86_64 iossimulator-x86_64-xcrun

# Static frameworks, since CocoaPods refuses an xcframework of bare static libraries here.
lipo -create "$work/libtermix_ssh2-sim-arm64.a" "$work/libtermix_ssh2-sim-x86_64.a" -output "$work/libtermix_ssh2-sim.a"
rm -rf "$out/TermixSsh2.xcframework"
args=""
for slice in device sim; do
  fw=$work/fw-$slice/TermixSsh2C.framework
  rm -rf "$fw" && mkdir -p "$fw/Headers" "$fw/Modules"
  cp "$work/libtermix_ssh2-$slice.a" "$fw/TermixSsh2C"
  cp "$here/core/termix_ssh2.h" "$fw/Headers/"
  printf 'framework module TermixSsh2C {
    header "termix_ssh2.h"
    export *
}
' > "$fw/Modules/module.modulemap"
  printf '<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>termix.ssh2</string><key>CFBundleName</key><string>TermixSsh2C</string><key>CFBundlePackageType</key><string>FMWK</string><key>CFBundleExecutable</key><string>TermixSsh2C</string></dict></plist>
' > "$fw/Info.plist"
  args="$args -framework $fw"
done
xcodebuild -create-xcframework $args -output "$out/TermixSsh2.xcframework" >/dev/null
echo "device lib $(wc -c < "$work/libtermix_ssh2-device.a") bytes"
echo "libssh2 ios build took $(( $(date +%s) - start ))s"
