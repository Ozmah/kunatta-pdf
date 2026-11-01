#!/usr/bin/env sh
# Checks what a running Kunatta promises over HTTP: routes, the per-language 404, security and
# cache headers, compression and crawler rules. Works against the local container (smoke.sh)
# and against a real deployment after it goes live.
set -eu

base=${1:?"usage: verify.sh <base-url> <preview|production>"}
app_env=${2:?"usage: verify.sh <base-url> <preview|production>"}
base=${base%/}
failures=0

fail() {
	echo "FAIL $*" >&2
	failures=$((failures + 1))
}

# Every request has a deadline: a server that accepts the connection and never answers fails
# the check instead of holding it until the CI job times out.
fetch() {
	curl --silent --connect-timeout 5 --max-time 20 "$@"
}

status() {
	fetch --output /dev/null --write-out "%{http_code}" "$base$1"
}

headers() {
	fetch --dump-header - --output /dev/null "$@"
}

expect_status() {
	actual=$(status "$1")
	[ "$actual" = "$2" ] || fail "$1 answered $actual, expected $2"
}

expect_header() {
	printf "%s" "$2" | grep -qi "^$3" || fail "$1 is missing $3"
}

refuse_header() {
	if printf "%s" "$2" | grep -qi "^$3"; then fail "$1 must not send $3"; fi
}

for route in /es/ /en/ /es/privacy/ /en/privacy/ /robots.txt /sitemap.xml /health /favicon.svg /og/es.png /og/en.png; do
	expect_status "$route" 200
done

# The root goes to the default language; routes without a trailing slash gain it.
root=$(headers "$base/")
expect_header / "$root" "HTTP/[0-9.]* 302"
expect_header / "$root" "Location: /es/"
slash=$(headers "$base/en/privacy")
expect_header /en/privacy "$slash" "HTTP/[0-9.]* 30[18]"
expect_header /en/privacy "$slash" "Location: /en/privacy/"

# A missing page answers 404 in the language of its path.
for case in "/en/missing en" "/es/no-existe es" "/no-existe es"; do
	route=${case% *}
	lang=${case#* }
	expect_status "$route" 404
	fetch "$base$route" | grep -q "<html lang=\"$lang\"" || fail "$route is not the $lang not-found page"
done

for route in /es/ /en/missing; do
	page=$(headers "$base$route")
	expect_header "$route" "$page" "Content-Security-Policy: default-src 'self'; script-src 'self';"
	expect_header "$route" "$page" "Content-Security-Policy: .*connect-src 'self' https://us.i.posthog.com;"
	expect_header "$route" "$page" "Content-Security-Policy: .*frame-ancestors 'none'"
	expect_header "$route" "$page" "X-Content-Type-Options: nosniff"
	expect_header "$route" "$page" "X-Frame-Options: DENY"
	expect_header "$route" "$page" "Cross-Origin-Opener-Policy: same-origin"
	refuse_header "$route" "$page" "Server:"
done

health=$(fetch "$base/health")
[ "$health" = '{"status":"healthy"}' ] || fail "/health answered $health"

home=$(fetch "$base/es/")

# Pages and scripts come precompressed, not compressed on every request.
compressed=$(headers -H "Accept-Encoding: zstd, br, gzip" "$base/es/")
expect_header /es/ "$compressed" "Content-Encoding: \(zstd\|br\)"

script=$(printf "%s" "$home" | grep -o '/_astro/[^"]*\.js' | head -n 1)
[ -n "$script" ] || fail "/es/ links no script"
asset=$(headers "$base$script")

font=$(headers "$base/fonts/office/Arimo_400Regular.ttf")
robots=$(fetch "$base/robots.txt")

if [ "$app_env" = production ]; then
	expect_header "$script" "$asset" "Cache-Control: public, max-age=31536000, immutable"
	expect_header "office font" "$font" "Cache-Control: public, max-age=604800"
	expect_header /es/ "$(headers "$base/es/")" "Cache-Control: public, max-age=0, must-revalidate"
	refuse_header /es/ "$(headers "$base/es/")" "X-Robots-Tag:"
	printf "%s" "$robots" | grep -q "^Sitemap: https://pdf.kunatta.tools/sitemap.xml$" || fail "robots.txt has no sitemap"
	printf "%s" "$home" | grep -q '/_astro/Analytics\.' || fail "production does not load analytics"
else
	expect_header /es/ "$(headers "$base/es/")" "X-Robots-Tag: noindex, nofollow, noarchive"
	expect_header /es/ "$(headers "$base/es/")" "Cache-Control: no-store"
	expect_header /en/missing "$(headers "$base/en/missing")" "X-Robots-Tag: noindex"
	printf "%s" "$robots" | grep -q "^Disallow: /$" || fail "preview robots.txt does not disallow everything"
	if printf "%s" "$home" | grep -q '/_astro/Analytics\.'; then fail "preview loads analytics"; fi
fi

if [ "$failures" -gt 0 ]; then
	echo "$failures check(s) failed for $base ($app_env)" >&2
	exit 1
fi

echo "$app_env verified at $base"
