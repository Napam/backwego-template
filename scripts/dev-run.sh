#!/usr/bin/env bash
# Invoked by wgo (dev.server): build, then run the server in the foreground so
# wgo can kill and restart the whole chain cleanly on the next change.
set -o pipefail

BIN="./bin/dev-app"
APP_HOST=${HOST:-localhost}
APP_PORT=${PORT:-8080}
RED=$'\033[31m'
RESET=$'\033[0m'

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
