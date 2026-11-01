# Builds the static site with Bun and serves it with Caddy. The final image holds Caddy and
# the built files only: no Node, no Bun, no source, no dependencies.
FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS bun

FROM node:24.22.2-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS build
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1 \
	HUSKY=0

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# Fails closed: without APP_ENV=production the build is a preview, without analytics.
# The PostHog project key is public by design; it ends up in the browser bundle.
ARG APP_ENV=preview
ARG PUBLIC_POSTHOG_KEY=
RUN APP_ENV="$APP_ENV" PUBLIC_POSTHOG_KEY="$PUBLIC_POSTHOG_KEY" bun run build \
	&& node deploy/precompress.ts dist

FROM caddy:2.11.7-alpine@sha256:e70b164da81ef698b3ad19af799ea6086ce6d9e48ed4079eb9fe26f6fbf14ee5 AS runtime

ARG APP_ENV=preview
ENV APP_ENV=${APP_ENV}

RUN addgroup -S -g 1001 app \
	&& adduser -S -D -H -u 1001 -G app app

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/caddy /etc/caddy/environments
# Owned by root and only readable by the server: a compromised Caddy cannot rewrite the site.
COPY --from=build /app/dist /srv

USER app

EXPOSE 3000

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
