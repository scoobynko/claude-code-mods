#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
failed=0

for branch in feat/image-preview-mod feature/panes fix/list-order bugfix/a hotfix/a perf/a breaking/a 'feat!/a' chore/a docs/a ci/release-workflow test/a refactor/a style/a build/a fix/v1.2_patch; do
  if ! "$here/check-branch-name.sh" "$branch" >/dev/null; then
    echo "FAIL $branch should be accepted"
    failed=1
  fi
done

for branch in main image-preview feat feat/ Feat/a feat/Add-Thing 'feat/has space' wip/a feat//a; do
  if "$here/check-branch-name.sh" "$branch" >/dev/null 2>&1; then
    echo "FAIL $branch should be refused"
    failed=1
  fi
done

if [ "$failed" -eq 0 ]; then echo "check-branch-name: all cases pass"; fi
exit "$failed"
