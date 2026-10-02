#!/usr/bin/env bash
set -euo pipefail

manifest=${1:?usage: set-version.sh MANIFEST VERSION}
version=${2:?usage: set-version.sh MANIFEST VERSION}

VERSION=$version perl -0pi -e 's/("version"\s*:\s*")[^"]*(")/$1$ENV{VERSION}$2/' "$manifest"
