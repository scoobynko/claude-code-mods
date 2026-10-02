#!/usr/bin/env bash
set -euo pipefail

branch=${1:?usage: check-branch-name.sh BRANCH}
pattern='^(feat|feature|fix|bugfix|hotfix|perf|breaking|chore|docs|ci|test|refactor|style|build)!?/[a-z0-9][a-z0-9._-]*$'

if [[ $branch =~ $pattern ]]; then
  echo "$branch is a conventional branch name"
  exit 0
fi

echo "Branch '$branch' is not a conventional branch name." >&2
echo "Use <type>/<short-description> in lowercase, for example feat/image-preview or fix/list-order." >&2
echo "Types: feat, fix, perf, breaking, chore, docs, ci, test, refactor, style, build." >&2
exit 1
