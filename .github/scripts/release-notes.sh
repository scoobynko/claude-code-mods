#!/usr/bin/env bash
set -euo pipefail

mod=${1:?usage: release-notes.sh MOD VERSION}
version=${2:?usage: release-notes.sh MOD VERSION}

previous=$(git tag --list "$mod-v*" --sort=-v:refname | grep -v -x -- "$mod-v$version" | head -n 1 || true)

if [ -z "$previous" ]; then
  echo "First release."
else
  git log --first-parent --format=%H "$previous..HEAD" -- "plugins/$mod" | while read -r commit; do
    subject=$(git log -1 --format=%s "$commit")
    case "$subject" in
      Release\ *) continue ;;
      Merge\ pull\ request\ \#*)
        number=${subject#Merge pull request \#}
        number=${number%% *}
        title=$(git log -1 --format=%b "$commit" | head -n 1)
        echo "- ${title:-$subject} (#$number)"
        ;;
      *) echo "- $subject" ;;
    esac
  done
fi

printf '\nInstall or update:\n\n```\n/plugin install %s@scoobynko-mods\n```\n' "$mod"
