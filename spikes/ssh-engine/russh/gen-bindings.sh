#!/bin/sh
# Builds the Rust core for this machine and writes Kotlin and Swift bindings to russh/generated.
set -eu
cd "$(dirname "$0")"
# Release builds are stripped, so bindings come from the debug build.
(cd core && cargo build)
lib=$(ls core/target/debug/libtermix_ssh_core.so core/target/debug/libtermix_ssh_core.dylib core/target/debug/termix_ssh_core.dll 2>/dev/null | head -1)
rm -rf generated
(cd bindgen && cargo run -q --release -- generate --library "../$lib" --language kotlin --language swift --no-format --out-dir ../generated)
mkdir -p generated/kotlin generated/swift
mv generated/uniffi generated/kotlin/
mv generated/*.swift generated/*.h generated/*.modulemap generated/swift/
echo "bindings in russh/generated"
