#!/usr/bin/env sh
# Starts a built image, runs verify.sh against it and checks the container itself.
# Usage: deploy/smoke.sh <image> <preview|production> [port]
set -eu

image=${1:?"usage: smoke.sh <image> <preview|production> [port]"}
app_env=${2:?"usage: smoke.sh <image> <preview|production> [port]"}
port=${3:-3100}
name="kunatta-smoke-$$"

cleanup() {
	docker rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run -d --name "$name" -p "$port:$port" -e APP_ENV="$app_env" -e PORT="$port" "$image" >/dev/null

attempt=0
# --max-time bounds each attempt, so 50 attempts bound the wait.
until curl --fail --silent --max-time 2 "http://127.0.0.1:$port/health" >/dev/null 2>&1; do
	attempt=$((attempt + 1))

	if [ "$attempt" -ge 50 ]; then
		docker logs "$name"
		exit 1
	fi

	sleep 0.2
done

sh "$(dirname "$0")/verify.sh" "http://127.0.0.1:$port" "$app_env"

# The server runs unprivileged, cannot change the site and ships no build tooling.
docker exec "$name" sh -c '
	[ "$(id -u)" = 1001 ] || { echo "runs as $(id -u)" >&2; exit 1; }
	! touch /srv/es/index.html 2>/dev/null || { echo "/srv is writable" >&2; exit 1; }
	! command -v node >/dev/null || { echo "node is in the image" >&2; exit 1; }
	! command -v bun >/dev/null || { echo "bun is in the image" >&2; exit 1; }
'

echo "$app_env container smoke test passed"
