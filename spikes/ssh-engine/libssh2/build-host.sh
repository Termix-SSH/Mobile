#!/bin/sh
# Builds the C core and its smoke test inside the host image. Run from this folder.
set -eu
out=${OUT:-build/host}
mkdir -p "$out"
CFLAGS="-O2 -g -Wall -Wextra -Wno-unused-parameter -fPIC -I/opt/libssh2/include"
LIBS="/opt/libssh2/lib/libssh2.a -lssl -lcrypto -lpthread"
cc $CFLAGS -c core/termix_ssh2.c -o "$out/termix_ssh2.o"
cc $CFLAGS core/smoke.c "$out/termix_ssh2.o" $LIBS -o "$out/smoke"
JAVA_INC=$(dirname "$(dirname "$(readlink -f "$(which javac)")")")/include
if [ -f jni/termix_ssh2_jni.c ]; then
  cc $CFLAGS -I"$JAVA_INC" -I"$JAVA_INC/linux" -Icore -shared jni/termix_ssh2_jni.c "$out/termix_ssh2.o" $LIBS -o "$out/libtermix_ssh2.so"
fi
echo built
