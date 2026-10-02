#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)

"$here/mods.sh" | while read -r mod version; do
  git rev-parse -q --verify "refs/tags/$mod-v$version" >/dev/null || echo "$mod $version"
done
