#!/usr/bin/env bash
set -euo pipefail

# Always operate from the repo root, regardless of where this is invoked from.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# --- defaults ---
DEFAULT_NAME="myapp"
DEFAULT_DISPLAY="My App"

echo "╔══════════════════════════════════════╗"
echo "║       Backwego Template Renamer      ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "⚠   WARNING: This is a one-way operation."
echo "   To undo, use: git checkout ."
echo ""

# --- collect inputs ---
echo "Accepts either:"
echo "  - a simple name (kebab-case, e.g. my-app)"
echo "  - a module path (e.g. example.com/user/my-app)"
echo ""
read -r -p "Project name or module path: " NAME
NAME="${NAME:-$DEFAULT_NAME}"

read -r -p "Display name (e.g. My App): " DISPLAY
DISPLAY="${DISPLAY:-$DEFAULT_DISPLAY}"

# --- derive module path, package name, kebab name ---
if [[ "$NAME" == */* ]]; then
    # Module path: full path for go.mod, last segment for package name
    # (hyphens stripped so it's a valid Go identifier).
    MODULE="$NAME"
    KEBAB="${NAME##*/}"
    PKG="${KEBAB//-/}"
else
    # Simple name: module path == package name (hyphens stripped), kebab
    # keeps hyphens for repo/docker dir names.
    KEBAB="$NAME"
    PKG="${NAME//-/}"
    MODULE="$PKG"
fi

echo ""
echo "══════════════════════════════════════"
echo "  Will replace:"
echo "    backwegotemplate  ->  $PKG  (package name, refs, log strings)"
if [[ "$MODULE" != "$PKG" ]]; then
    echo "    backwegotemplate  ->  $MODULE  (go.mod module + import paths)"
fi
echo "    Backwego Template ->  $DISPLAY"
echo "    backwego-template ->  $KEBAB"
echo "══════════════════════════════════════"
echo ""
echo "⚠   One-way operation. Undo with: git checkout ."
echo ""
read -r -p "Continue? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Replacing..."

# Escape a string for use as the replacement text in a sed s||| command.
# Backslash, ampersand, and the delimiter '|' are prefixed with backslash.
esc() {
    printf '%s' "$1" | sed 's/[\&|]/\\&/g'
}

M=$(esc "$MODULE")
P=$(esc "$PKG")
D=$(esc "$DISPLAY")
K=$(esc "$KEBAB")

# Files to scan (exclude this script so it stays reusable, plus build output
# and dependency dirs whose contents are regenerated).
FILES=$(find . -type f \
    \( -name '*.go' -o -name '*.templ' -o -name '*.ts' -o -name '*.yml' \
     -o -name '*.md' -o -name 'go.mod' \) \
    -not -path './.git/*' \
    -not -path './web/node_modules/*' \
    -not -path './web/tmp/*' \
    -not -path './web/static/*' \
    -not -path './bin/*' \
    -not -name 'rename.sh')

# Order matters: specific patterns go first so the catch-all doesn't mangle
# them. All sed commands use '|' as the delimiter so slashes in module paths
# (e.g. github.com/user/my-app) are interpreted literally.
while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    # go.mod module line
    sed -i '' "s|^module backwegotemplate\$|module $M|" "$f"
    # package declarations: 'package backwegotemplate' -> 'package <pkg>'
    sed -i '' "s|^package backwegotemplate\$|package $P|" "$f"
    # import paths: '"backwegotemplate"' or '"backwegotemplate/..."' -> module
    # The [/"] after backwegotemplate restricts the match to real import paths
    # so a string literal like the localStorage key '"backwegotemplate-theme"'
    # is left for the catch-all below to handle with the package name.
    sed -i '' "s|\"backwegotemplate\\([/\"]\\)|\"$M\\1|g" "$f"
    # qualified references: 'backwegotemplate.' -> '<pkg>.'
    sed -i '' "s|backwegotemplate\\.|$P.|g" "$f"
    # everything else (localStorage keys, log strings, docker tags, ...)
    sed -i '' "s|backwegotemplate|$P|g" "$f"
    # display name
    sed -i '' "s|Backwego Template|$D|g" "$f"
    # kebab name
    sed -i '' "s|backwego-template|$K|g" "$f"
done <<< "$FILES"

# Regenerate templ + web bundle so build artifacts match the new name.
echo ""
echo "Regenerating build artifacts..."
( cd web && command -v bun > /dev/null 2>&1 && bun run build.ts) || echo "  (skipped web bundle: bun not available)"
( go tool templ generate > /dev/null 2>&1) || echo "  (skipped templ regen: templ tool unavailable)"

echo ""
echo "Done! Verify with: task check"
