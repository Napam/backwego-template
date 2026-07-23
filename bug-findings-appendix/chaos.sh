#!/usr/bin/env bash
# Faithfully reproduce what an agent burst does to the proxy, time-compressed:
# - several SSE "tabs" that connect, wait for a reload, disconnect (reload), repeat
# - real edits to templ/go/ts files
# - notify-proxy POST bursts (what dev.web + dev-run.sh + templ SendSSE produce)
cd "$(dirname "$0")/.."
PROXY=http://localhost:7331

tab() {
    while true; do
        curl -s -o /dev/null --max-time 20 "$PROXY/"
        curl -s -N --max-time 20 "$PROXY/_templ/reload/events" 2>/dev/null | while IFS= read -r line; do
            case "$line" in "data: reload") break ;; esac
        done
    done
}

for t in 1 2 3 4 5 6; do tab & done

notify_flood() {
    while true; do
        # triple notify, like templ SendSSE + dev.web notify + dev-run.sh notify
        for _ in 1 2 3; do curl -s -o /dev/null -X POST --max-time 5 "$PROXY/_templ/reload/events" & done
        wait
        sleep 0.05
    done
}
notify_flood &

ROOT=web/root/root.templ
i=0
while [ $i -lt 200 ]; do
    i=$((i+1))
    sed -i '' "s/A starter template for building fullstack SSR-first web applications[0-9]*/A starter template for building fullstack SSR-first web applications$i/" "$ROOT"
    sleep 0.1
done
wait
