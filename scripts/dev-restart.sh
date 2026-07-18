#!/usr/bin/env bash
# Invoked by templ watch (--cmd) on structural changes, right before templ
# sends the browser reload event. Kill the server first: the old binary would
# render broken output with the freshly rewritten _templ.txt, and the templ
# proxy retries a dead upstream with backoff, so the reload simply blocks
# until wgo (dev.server) has built and started the new binary.
# -x -f: match the exact full command line, so unrelated processes that
# merely mention bin/dev-app in their arguments are not killed
pkill -TERM -x -f './bin/dev-app' 2> /dev/null
# signal wgo to rebuild; must be a content write, wgo ignores mtime-only touches
cp go.mod tmp/restart.trigger
