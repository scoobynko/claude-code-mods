#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
failed=0
work=$(mktemp -d)
trap 'rm -r "$work"' EXIT

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

check() {
  local label=$1 want=$2 got=$3
  if [ "$got" != "$want" ]; then
    echo "FAIL $label"
    echo "  wanted: $(printf '%s' "$want" | tr '\n' '|')"
    echo "  got:    $(printf '%s' "$got" | tr '\n' '|')"
    failed=1
  fi
}

manifest() {
  mkdir -p "plugins/$1/.claude-plugin"
  printf '{\n  "name": "%s",\n  "version": "%s",\n  "keywords": [\n    "mod"\n  ]\n}\n' "$1" "$2" > "plugins/$1/.claude-plugin/plugin.json"
}

merge() {
  local number=$1 branch=$2 title=$3
  git merge -q --no-ff "$branch" -m "Merge pull request #$number from someone/$branch" -m "$title"
}

cd "$work"
git init -q -b main .
manifest alpha 1.2.0
manifest beta 0.3.0
echo "alpha" > plugins/alpha/README.md
git add . && git commit -q -m "Start"
git tag alpha-v1.2.0
git tag v0.9.0

check "a mod with no tag is unreleased" "beta 0.3.0" "$("$here/unreleased.sh")"
git tag beta-v0.3.0
check "nothing is unreleased once every version has a tag" "" "$("$here/unreleased.sh")"

git checkout -q -b feat/alpha-thing
echo "more" >> plugins/alpha/README.md
git commit -q -am "Add a thing"
git checkout -q main
merge 7 feat/alpha-thing "Add a thing to alpha"
git diff --name-only HEAD^1 HEAD > "$work/changed"

check "a feat branch bumps the mod it touched, and only that one" "alpha 1.3.0" "$("$here/plan-bumps.sh" feat/alpha-thing "$work/changed")"
check "a fix branch bumps the patch" "alpha 1.2.1" "$("$here/plan-bumps.sh" fix/alpha-thing "$work/changed")"
check "a docs branch bumps nothing" "" "$("$here/plan-bumps.sh" docs/alpha-thing "$work/changed")"
check "a direct push bumps nothing" "" "$("$here/plan-bumps.sh" none "$work/changed")"

"$here/set-version.sh" plugins/alpha/.claude-plugin/plugin.json 1.3.0
check "the version is rewritten in place" '  "version": "1.3.0",' "$(grep '"version"' plugins/alpha/.claude-plugin/plugin.json)"
check "nothing else in the manifest changes" "1" "$(git diff --numstat plugins/alpha/.claude-plugin/plugin.json | cut -f1)"
git commit -q -am "Release alpha 1.3.0 [skip ci]"

check "a bumped mod is unreleased until tagged" "alpha 1.3.0" "$("$here/unreleased.sh")"
check "notes list the pull requests that touched the mod, and how to install it" \
  "$(printf -- '- Add a thing to alpha (#7)\n\nInstall or update:\n\n```\n/plugin install alpha@scoobynko-mods\n```')" \
  "$("$here/release-notes.sh" alpha 1.3.0)"
git tag alpha-v1.3.0

check "a mod whose version was raised by hand in the pull request is not bumped again" "" \
  "$(manifest beta 0.4.0; echo plugins/beta/.claude-plugin/plugin.json > "$work/changed"; "$here/plan-bumps.sh" feat/beta-thing "$work/changed")"
check "and is released as it stands" "beta 0.4.0" "$("$here/unreleased.sh")"

manifest gamma 0.1.0
git add . && git commit -q -m "Add gamma"
echo plugins/gamma/.claude-plugin/plugin.json > "$work/changed"
check "a new mod is not bumped before its first release" "" "$("$here/plan-bumps.sh" feat/gamma "$work/changed")"
check "a first release says so" "$(printf 'First release.\n\nInstall or update:\n\n```\n/plugin install gamma@scoobynko-mods\n```')" "$("$here/release-notes.sh" gamma 0.1.0)"

if [ "$failed" -eq 0 ]; then echo "release: all cases pass"; fi
exit "$failed"
