#!/usr/bin/env bash
set -euo pipefail

branch=${1:?usage: next-version.sh BRANCH [LATEST_TAG]}
latest=${2:-v0.0.0}

if ! [[ $latest =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "not a version: $latest" >&2
  exit 1
fi
major=${BASH_REMATCH[1]}
minor=${BASH_REMATCH[2]}
patch=${BASH_REMATCH[3]}

case "$branch" in
  breaking/* | *!/*) echo "v$((major + 1)).0.0" ;;
  feat/* | feature/*) echo "v$major.$((minor + 1)).0" ;;
  fix/* | bugfix/* | hotfix/* | perf/*) echo "v$major.$minor.$((patch + 1))" ;;
esac
