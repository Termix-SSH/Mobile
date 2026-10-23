#!/bin/sh
# Cross-compiles OpenSSL, libssh2 and the core plus JNI glue for Android.
# Needs Linux or macOS, ANDROID_NDK_HOME, perl, make, cmake and curl.
# Output: ../build/android/jniLibs/<abi>/libtermix_ssh2.so
set -eu
here=$(cd "$(dirname "$0")" && pwd)
NDK=${ANDROID_NDK_HOME:?set ANDROID_NDK_HOME}
API=24
OPENSSL=${OPENSSL_VERSION:-3.5.9}
LIBSSH2=${LIBSSH2_VERSION:-1.11.1}
ABIS=${ABIS:-arm64-v8a armeabi-v7a x86_64 x86}
work=${WORK:-$here/build/android-work}
out=$here/../build/android/jniLibs
host=$(uname -s | tr '[:upper:]' '[:lower:]')-x86_64
tc=$NDK/toolchains/llvm/prebuilt/$host
mkdir -p "$work" "$out"

[ -d "$work/openssl-$OPENSSL" ] || curl -sSL "https://github.com/openssl/openssl/releases/download/openssl-$OPENSSL/openssl-$OPENSSL.tar.gz" | tar xz -C "$work"
[ -d "$work/libssh2-$LIBSSH2" ] || curl -sSL "https://libssh2.org/download/libssh2-$LIBSSH2.tar.gz" | tar xz -C "$work"

start=$(date +%s)
for abi in $ABIS; do
  case $abi in
    arm64-v8a) ossl=android-arm64; triple=aarch64-linux-android ;;
    armeabi-v7a) ossl=android-arm; triple=armv7a-linux-androideabi ;;
    x86_64) ossl=android-x86_64; triple=x86_64-linux-android ;;
    x86) ossl=android-x86; triple=i686-linux-android ;;
  esac
  prefix=$work/prefix/$abi
  if [ ! -f "$prefix/lib/libcrypto.a" ]; then
    rm -rf "$work/ossl-$abi" && cp -r "$work/openssl-$OPENSSL" "$work/ossl-$abi"
    (cd "$work/ossl-$abi" && PATH=$tc/bin:$PATH ANDROID_NDK_ROOT=$NDK ./Configure "$ossl" -D__ANDROID_API__=$API \
      no-shared no-tests no-apps no-docs no-engine no-module no-legacy --prefix="$prefix" --libdir=lib >/dev/null \
      && PATH=$tc/bin:$PATH make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)" build_libs >/dev/null \
      && make install_dev >/dev/null)
  fi
  if [ ! -f "$prefix/lib/libssh2.a" ]; then
    cmake -S "$work/libssh2-$LIBSSH2" -B "$work/ssh2-$abi" -DCMAKE_TOOLCHAIN_FILE="$NDK/build/cmake/android.toolchain.cmake" \
      -DANDROID_ABI=$abi -DANDROID_PLATFORM=$API -DCRYPTO_BACKEND=OpenSSL -DOPENSSL_ROOT_DIR="$prefix" \
      -DOPENSSL_INCLUDE_DIR="$prefix/include" -DOPENSSL_CRYPTO_LIBRARY="$prefix/lib/libcrypto.a" \
      -DOPENSSL_SSL_LIBRARY="$prefix/lib/libssl.a" -DOPENSSL_USE_STATIC_LIBS=TRUE -DBUILD_SHARED_LIBS=OFF -DBUILD_EXAMPLES=OFF -DBUILD_TESTING=OFF \
      -DENABLE_ZLIB_COMPRESSION=OFF -DCMAKE_BUILD_TYPE=MinSizeRel -DCMAKE_INSTALL_PREFIX="$prefix" >/dev/null
    cmake --build "$work/ssh2-$abi" -j >/dev/null && cmake --install "$work/ssh2-$abi" >/dev/null
  fi
  mkdir -p "$out/$abi"
  "$tc/bin/${triple}${API}-clang" -shared -fPIC -Os -ffunction-sections -fdata-sections -I"$prefix/include" -I"$here/core" \
    "$here/core/termix_ssh2.c" "$here/jni/termix_ssh2_jni.c" "$prefix/lib/libssh2.a" "$prefix/lib/libssl.a" "$prefix/lib/libcrypto.a" \
    -llog -Wl,--gc-sections -Wl,-z,max-page-size=16384 -Wl,--exclude-libs,ALL -s -o "$out/$abi/libtermix_ssh2.so"
  echo "$abi $(wc -c < "$out/$abi/libtermix_ssh2.so") bytes"
done
echo "libssh2 android build took $(( $(date +%s) - start ))s"
