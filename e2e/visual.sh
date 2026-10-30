#!/bin/sh
# Takes or checks the screenshots inside the Playwright image, so pixels match on every machine
# and in CI. The image version follows the installed @playwright/test. Extra arguments go to
# `playwright test` (for example --update-snapshots).
set -eu

version=$(node -p "require('@playwright/test/package.json').version")

exec docker run --rm --ipc=host \
	--user "$(id -u):$(id -g)" \
	-e HOME=/tmp -e VISUAL=1 -e CI \
	-v "$PWD:/work" -w /work \
	"mcr.microsoft.com/playwright:v$version-noble" \
	npx playwright test "$@"
