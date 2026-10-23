#!/bin/sh
# Builds both engines for Linux and runs the JVM scenario suite. Run inside the dev image from spikes/ssh-engine.
set -eu
root=$(pwd)
(cd libssh2 && ./build-host.sh >/dev/null)
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-/tmp/termix-rust}
(cd russh/core && cargo build --release -q && cargo build -q)
mkdir -p russh/core/target/release
cp "$CARGO_TARGET_DIR/release/libtermix_ssh_core.so" russh/core/target/release/
rm -rf russh/generated
# Release builds are stripped, so bindings come from the debug build's metadata.
(cd russh/bindgen && cargo run -q --release -- generate --library "$CARGO_TARGET_DIR/debug/libtermix_ssh_core.so" \
  --language kotlin --language swift --no-format --out-dir ../generated)
(cd russh/generated && mkdir -p kotlin swift && mv uniffi kotlin/ && mv ./*.swift ./*.h ./*.modulemap swift/)
cp russh/core/target/release/libtermix_ssh_core.so libssh2/build/host/
cd harness/android
gradle --console=plain :host:test -PnativeLibs="$root/libssh2/build/host" "$@"
