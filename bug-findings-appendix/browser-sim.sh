#!/usr/bin/env bash
# Simulate a browser tab on the live-reload proxy:
# load page, open SSE, close on first "reload" (what script.js does), repeat.
PROXY=http://localhost:7331
n=0
while true; do
    n=$((n+1))
    echo "$n" > "tmp/sim-$1.count"
    curl -s -o /dev/null --max-time 30 "$PROXY/"
    curl -s -N --max-time 30 "$PROXY/_templ/reload/events" 2>/dev/null | while IFS= read -r line; do
        case "$line" in
            "data: reload") break ;;
        esac
    done
done
