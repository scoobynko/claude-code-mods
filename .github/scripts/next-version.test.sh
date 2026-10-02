#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
failed=0

expect() {
  local branch=$1 latest=$2 want=$3 got
  got=$("$here/next-version.sh" "$branch" "$latest")
  if [ "$got" != "$want" ]; then
    echo "FAIL $branch after $latest: wanted '$want', got '$got'"
    failed=1
  fi
}

expect feat/image-preview-mod v0.0.0 v0.1.0
expect feature/panes v0.1.3 v0.2.0
expect fix/list-order v0.2.0 v0.2.1
expect bugfix/list-order v1.9.9 v1.9.10
expect hotfix/crash v1.2.3 v1.2.4
expect perf/faster-scan v1.2.3 v1.2.4
expect breaking/new-layout v0.4.2 v1.0.0
expect feat!/new-layout v1.4.2 v2.0.0
expect fix!/drop-option v1.4.2 v2.0.0
expect chore/tidy v1.2.3 ""
expect docs/readme v1.2.3 ""
expect ci/release-workflow v1.2.3 ""
expect refactor/collect v1.2.3 ""
expect none v1.2.3 ""
expect some-branch v1.2.3 ""

if "$here/next-version.sh" feat/x not-a-version >/dev/null 2>&1; then
  echo "FAIL a malformed latest version was accepted"
  failed=1
fi

if [ "$failed" -eq 0 ]; then echo "next-version: all cases pass"; fi
exit "$failed"
