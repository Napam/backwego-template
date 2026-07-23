#!/usr/bin/env bash
# Simulate an agent doing multi-file edit bursts: each pass touches a
# .templ (alternating text-only / structural), a .go and a .ts file
# within milliseconds of each other — like an agent applying a change
# across the stack.
set -u
cd "$(dirname "$0")/.."
ROOT=web/root/root.templ
GO=cmd/serve/main.go
TS=web/lib/web-components/buttons/theme-button.ts

for i in $(seq 1 60); do
    # templ edit
    if [ $((i % 2)) -eq 0 ]; then
        sed -i '' "s/A starter template for building fullstack SSR-first web applications[0-9]*/A starter template for building fullstack SSR-first web applications$i/" "$ROOT"
    else
        if grep -q 'data-burst' "$ROOT"; then
            sed -i '' 's/ data-burst="[0-9]*"//' "$ROOT"
        else
            sed -i '' 's/<main class="mx-auto/<main data-burst="'"$i"'" class="mx-auto/' "$ROOT"
        fi
    fi
    # go edit (immediately after)
    if grep -q '// burst:' "$GO"; then
        sed -i '' "s|// burst: [0-9]*|// burst: $i|" "$GO"
    else
        printf '\n// burst: %s\n' "$i" >> "$GO"
    fi
    # ts edit (immediately after)
    if grep -q '// burst:' "$TS"; then
        sed -i '' "s|// burst: [0-9]*|// burst: $i|" "$TS"
    else
        printf '\n// burst: %s\n' "$i" >> "$TS"
    fi
    sleep 0.15
done
