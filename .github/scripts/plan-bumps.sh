#!/usr/bin/env bash
set -euo pipefail

branch=${1:?usage: plan-bumps.sh BRANCH CHANGED_FILES}
changed=${2:?usage: plan-bumps.sh BRANCH CHANGED_FILES}
here=$(cd "$(dirname "$0")" && pwd)

"$here/mods.sh" | while read -r mod version; do
  grep -q "^plugins/$mod/" "$changed" || continue
  git rev-parse -q --verify "refs/tags/$mod-v$version" >/dev/null || continue
  next=$("$here/next-version.sh" "$branch" "$version")
  [ -z "$next" ] || echo "$mod $next"
done
