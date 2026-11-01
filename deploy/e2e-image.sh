#!/usr/bin/env sh
# Runs the end-to-end suite against a built image, so the tests see what production serves:
# Caddy's Content-Security-Policy, headers and not-found pages.
# Usage: deploy/e2e-image.sh <image> [port] [playwright arguments...]
set -eu

image=${1:?"usage: e2e-image.sh <image> [port] [playwright arguments...]"}
port=${2:-3200}
shift $(($# < 2 ? $# : 2))
name="kunatta-e2e-$$"

cleanup() {
	docker rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run -d --name "$name" -p "$port:$port" -e PORT="$port" "$image" >/dev/null

attempt=0
until curl --fail --silent "http://127.0.0.1:$port/health" >/dev/null 2>&1; do
	attempt=$((attempt + 1))

	if [ "$attempt" -ge 50 ]; then
		docker logs "$name"
		exit 1
	fi

	sleep 0.2
done

E2E_BASE_URL="http://127.0.0.1:$port" bunx playwright test "$@"
