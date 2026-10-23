#!/bin/sh
# Runs the instrumented suite on a booted emulator and collects TXRESULT lines.
set -u
out=${RESULTS_DIR:-results}
mkdir -p "$out"
apk=harness/android/app/build/outputs/apk
adb install -r -g "$apk/debug/app-debug.apk"
adb install -r -g "$apk/androidTest/debug/app-debug-androidTest.apk"
adb logcat -c
adb logcat -s TXRESULT:I -v raw > "$out/android-logcat.txt" &
logpid=$!
adb shell am instrument -w -r -e sshHost 10.0.2.2 ${ANDROID_TEST_ARGS:-} termix.ssh.harness.test/androidx.test.runner.AndroidJUnitRunner | tee "$out/android-instrument.txt"
sleep 2
kill $logpid 2>/dev/null
adb pull /sdcard/Android/data/termix.ssh.harness/files/results.jsonl "$out/android.jsonl" 2>/dev/null   || grep '^{' "$out/android-logcat.txt" > "$out/android.jsonl" || true
# fail the job when a required scenario failed
! grep -q "FAILURES!!!" "$out/android-instrument.txt"
