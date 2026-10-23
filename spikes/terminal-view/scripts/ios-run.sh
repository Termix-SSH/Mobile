#!/bin/sh
# Runs every engine and scenario in the lab on a booted simulator and keeps
# the TXRESULT lines from the unified log.
#
#   sh ios-run.sh <Termix.app> <results dir>
set -u
APP=$1
OUT=$2
BUNDLE=com.karmaa.termix
SECONDS_PER_RUN=${SECONDS_PER_RUN:-15}
REPEATS=${REPEATS:-2}
mkdir -p "$OUT"

xcrun simctl install booted "$APP"

run() {
  engine=$1 scenario=$2 rate=$3
  xcrun simctl terminate booted $BUNDLE 2>/dev/null || true
  started=$(date '+%Y-%m-%d %H:%M:%S')
  url="termix-mobile://dev/terminal-lab?engine=$engine&scenario=$scenario&seconds=$SECONDS_PER_RUN&rate=$rate&auto=1"
  xcrun simctl openurl booted "$url"
  waited=0
  limit=$((SECONDS_PER_RUN + 40))
  line=""
  while [ $waited -lt $limit ]; do
    sleep 3
    waited=$((waited + 3))
    line=$(xcrun simctl spawn booted log show --start "$started" --style compact \
      --predicate 'eventMessage CONTAINS "TXRESULT"' 2>/dev/null | grep -o 'TXRESULT {.*}' | tail -1)
    [ -n "$line" ] && break
  done
  if [ -n "$line" ]; then
    echo "$line" | tee -a "$OUT/ios.txt"
  else
    echo "no result for $engine $scenario" | tee -a "$OUT/ios-missing.txt"
    xcrun simctl io booted screenshot "$OUT/missing-$engine-$scenario.png" || true
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

xcrun simctl io booted screenshot "$OUT/last-screen.png" || true
