#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
failed=0

expect() {
  local branch=$1 current=$2 want=$3 got
  got=$("$here/next-version.sh" "$branch" "$current")
  if [ "$got" != "$want" ]; then
    echo "FAIL $branch after $current: wanted '$want', got '$got'"
    failed=1
  fi
}

expect feat/image-preview-mod 0.1.0 0.2.0
expect feature/panes 0.1.3 0.2.0
expect fix/list-order 0.2.0 0.2.1
expect bugfix/list-order 1.9.9 1.9.10
expect hotfix/crash 1.2.3 1.2.4
expect perf/faster-scan 1.2.3 1.2.4
expect breaking/new-layout 0.4.2 1.0.0
expect feat!/new-layout 1.4.2 2.0.0
expect fix!/drop-option 1.4.2 2.0.0
expect chore/tidy 1.2.3 ""
expect docs/readme 1.2.3 ""
expect ci/release-workflow 1.2.3 ""
expect refactor/collect 1.2.3 ""
expect none 1.2.3 ""
expect some-branch 1.2.3 ""

if "$here/next-version.sh" feat/x not-a-version >/dev/null 2>&1; then
  echo "FAIL a malformed version was accepted"
  failed=1
fi

if [ "$failed" -eq 0 ]; then echo "next-version: all cases pass"; fi
exit "$failed"
