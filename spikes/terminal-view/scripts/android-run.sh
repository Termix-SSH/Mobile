#!/bin/sh
# Runs every engine and scenario in the lab on a booted emulator and keeps
# the TXRESULT lines. Each run starts from a cold app process.
#
#   sh android-run.sh <apk> <results dir>
set -u
APK=$1
OUT=$2
PKG=com.karmaa.termix
SECONDS_PER_RUN=${SECONDS_PER_RUN:-15}
REPEATS=${REPEATS:-2}
mkdir -p "$OUT"

adb install -r "$APK"
adb shell getprop ro.build.version.release > "$OUT/android-version.txt"

run() {
  engine=$1 scenario=$2 rate=$3
  adb shell am force-stop $PKG
  adb logcat -c
  url="termix-mobile://dev/terminal-lab?engine=$engine&scenario=$scenario&seconds=$SECONDS_PER_RUN&rate=$rate&auto=1"
  adb shell am start -W -a android.intent.action.VIEW -d "'$url'" $PKG > /dev/null
  # Settle time in the lab, the run, and a margin.
  waited=0
  limit=$((SECONDS_PER_RUN + 30))
  while [ $waited -lt $limit ]; do
    sleep 2
    waited=$((waited + 2))
    if adb logcat -d -s TermixLab:I | grep -q TXRESULT; then break; fi
  done
  line=$(adb logcat -d -s TermixLab:I | grep -o 'TXRESULT {.*}' | tail -1)
  if [ -n "$line" ]; then
    echo "$line" | tee -a "$OUT/android.txt"
  else
    echo "no result for $engine $scenario" | tee -a "$OUT/android-missing.txt"
    adb logcat -d -t 200 > "$OUT/logcat-$engine-$scenario.txt"
  fi
}

for r in $(seq 1 "$REPEATS"); do
  for engine in ghostty native xterm; do
    run "$engine" idle 0
    run "$engine" echo 0
    run "$engine" yes 0
    run "$engine" log 4
    run "$engine" alt 0
  done
done

adb shell am force-stop $PKG
adb exec-out screencap -p > "$OUT/last-screen.png" || true
