- Use the `tmp/` directory for temporary files when testing or experimenting
  (scratch scripts, test output, etc). It is gitignored.

- Keep yourself updated with what is in Taskfile.yml in order to ensure that you
  run correct commands.

- After doing changes, run static and build checks:
  - go code, run `task check.go`
  - web code, run `task check.web`
  - if both, run `task check` to check everything
  - to auto-fix formatting/linting, run `task fix` (or `task fix.go` / `task fix.web`)

- In `web/` avoid having inline svgs, always make icons at `web/lib/web-components/icons`

- JS bundling (see `web/build.ts`):
  - `web/lib/**/*.ts` → single shared `static/bundle.js`, loaded synchronously
    in `<head>` (registers all web components before body parses).
  - `.ts` files in any other top-level dir (e.g. `web/root/root.ts`, next to
    its `.templ`) → per-file page bundles in `static/page-files/<dir>/`,
    loaded per page with `<script defer>`.
  - Page files must not import from `lib/`: iife has no code splitting, so
    lib code would be duplicated and re-registering custom elements throws.
    bundle.js loads first; page scripts interact with components via the DOM.
