#!/usr/bin/env bash
set -euo pipefail

branch=${1:?usage: next-version.sh BRANCH VERSION}
current=${2:?usage: next-version.sh BRANCH VERSION}

if ! [[ $current =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "not a version: $current" >&2
  exit 1
fi
major=${BASH_REMATCH[1]}
minor=${BASH_REMATCH[2]}
patch=${BASH_REMATCH[3]}

case "$branch" in
  breaking/* | *!/*) echo "$((major + 1)).0.0" ;;
  feat/* | feature/*) echo "$major.$((minor + 1)).0" ;;
  fix/* | bugfix/* | hotfix/* | perf/*) echo "$major.$minor.$((patch + 1))" ;;
esac
