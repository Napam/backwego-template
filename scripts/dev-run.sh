#!/usr/bin/env bash
# build + run the dev server.  called two ways:
#   wgo (dev.server)            → build, then exec server in foreground
#   templ --cmd dev-run.sh      → structural change: kill old server, signal
#   restart                       wgo to rebuild, then EXIT (wgo does the build)
set -o pipefail

BIN="./bin/dev-app"
APP_HOST=${HOST:-localhost}
APP_PORT=${PORT:-8080}
RED=$'\033[31m'
RESET=$'\033[0m'

# structural change: kill old server so it can't render broken output with the
# freshly rewritten _templ.txt, then signal wgo to rebuild. templ's proxy
# retries the dead upstream with backoff, so the browser blocks until the new
# server is up. exit immediately — wgo owns the actual build+run.
if [[ "${1:-}" == "restart" ]]; then
    pkill -TERM -x -f './bin/dev-app' 2> /dev/null
    cp go.mod tmp/restart.trigger
    exit 0
fi

# wait (max ~10s) for the templ proxy at boot, when templ is still rewriting
# _templ.go files into dev mode; building against half-written files fails.
# on non-boot restarts the proxy is already up so this returns instantly.
for _ in {1..100}; do
    nc -z "${LIVE_RELOAD_PROXY_HOST:-localhost}" "${LIVE_RELOAD_PROXY_PORT:-7331}" 2> /dev/null && break
    sleep 0.1
done

# Piping to sed instead of process substitution (2> >(...)) avoids orphaned
# sed processes hanging around after the script exits
if ! go build -tags=noembed -gcflags="-N -l" -o "$BIN" ./cmd/serve 2>&1 | sed -E "/\.go:/s/.*/${RED}&${RESET}/" >&2; then
    echo "${RED}build failed — server down until next change${RESET}" >&2
    exit 1
fi

# Reload the browser only once the new server actually answers, otherwise the
# templ proxy serves nothing after rapid restarts
(
    for _ in {1..100}; do
        nc -z "$APP_HOST" "$APP_PORT" 2> /dev/null && break
        sleep 0.1
    done
    go tool templ generate --notify-proxy \
        --proxybind="${LIVE_RELOAD_PROXY_HOST:-localhost}" \
        --proxyport="${LIVE_RELOAD_PROXY_PORT:-7331}" > /dev/null 2>&1
) &

# Detach stdin so the server doesn't fight Task/templ for terminal input,
# which can swallow keystrokes like Ctrl+C
exec "$BIN" < /dev/null
