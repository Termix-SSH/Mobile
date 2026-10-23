#!/bin/sh
# Copies generated bindings and test resources into the Swift harness. Run after both build-ios.sh scripts.
set -eu
h=harness/ios
mkdir -p "$h/Sources/RusshEngine/Generated"
cp build/ios/swift/termix_ssh_core.swift "$h/Sources/RusshEngine/Generated/"
rm -rf "$h/Tests/ScenarioTests/Resources" && mkdir -p "$h/Tests/ScenarioTests/Resources/keys"
cp server/out/* "$h/Tests/ScenarioTests/Resources/keys/"
cp server/algos.json "$h/Tests/ScenarioTests/Resources/"
