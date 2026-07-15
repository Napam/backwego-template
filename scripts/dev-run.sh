#!/usr/bin/env bash
# Dev server runner. Colors compile errors red, kills old server on failure
# so stale binary doesn't mislead.
set -o pipefail

PIDFILE=./tmp/dev-app.pid
BIN=./bin/dev-app
RED=$(printf '\033[31m')
RESET=$(printf '\033[0m')

# Stop the currently running server and wait for it to release the port.
kill_old() {
    [ -f "$PIDFILE" ] || return 0
    local pid
    pid=$(cat "$PIDFILE")
    rm -f "$PIDFILE"
    [ -n "$pid" ] || return 0
    kill -0 "$pid" 2> /dev/null || return 0
    kill "$pid" 2> /dev/null
    # Poll until it's actually gone so the new server can bind the port.
    for _ in $(seq 1 50); do
        kill -0 "$pid" 2> /dev/null || return 0
        sleep 0.1
    done
    # Still alive after ~5s: force it.
    kill -9 "$pid" 2> /dev/null
}

# Build first so the running server keeps serving while we compile.
# Color compiler errors red for visibility.
if ! go build -tags=noembed -gcflags="-N -l" -o "$BIN" ./cmd/serve 2> >(sed -E "/\.go:/s/.*/${RED}&${RESET}/" >&2); then
    # Kill old server on failure so stale binary doesn't mislead.
    kill_old
    echo "${RED}build failed — server stopped${RESET}" >&2
    exit 1
fi

# Build succeeded: swap in the new binary.
kill_old
"$BIN" &
echo $! > "$PIDFILE"
