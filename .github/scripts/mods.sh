#!/usr/bin/env bash
set -euo pipefail

for manifest in plugins/*/.claude-plugin/plugin.json; do
  [ -f "$manifest" ] || continue
  mod=${manifest#plugins/}
  mod=${mod%%/*}
  version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$manifest" | head -n 1)
  [ -n "$version" ] && echo "$mod $version"
done
