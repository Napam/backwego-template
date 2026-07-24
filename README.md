# Backwego Template

Opinionated template for SSR-first Go apps: templ for HTML, tailwindcss for
styling, Lit for web components, sqlite for data, goose for migrations.
Everything compiles into a single binary, all with live reload.

This template is a base for hypermedia driven applications, and fits very well
with frameworks such as [htmx](https://htmx.org/).

Requirements:

- [go](https://go.dev)
- [task](https://taskfile.dev)
- [bun](https://bun.com/) - for frontend asset building

## Quickstart

1. Grab the repo via GitHub's "Use this template" button
   (gives you a fresh repo with no history).

   <details>
   <summary>Or you can git clone and reset the git state</summary>

   ```sh
   git clone --depth 1 https://github.com/Napam/backwego-template my-app
   cd my-app
   rm -rf .git
   git init && git add -A && git commit -m "initial"
   ```

   </details>

2. Using this as a template for your own project? Run the rename wizard first,
   see [Renaming](#renaming).

3. In the repo root, run `task dev`. This sets up the git pre-push hook,
   installs the pinned golangci-lint into `bin/`, and starts the dev server
   with live reload.

4. Open the site at `localhost:7331` (the live reload proxy; configure via
   `LIVE_RELOAD_PROXY_PORT` in `Taskfile.yml`). The app itself listens on
   `PORT` (default `8080`).

5. Start making changes: the application entrypoint is `cmd/serve/main.go` and
   the frontend root page is `web/root/root.templ`.

For production build: `task build.go` (output in `bin/app`).

Directory conventions: `bin/` holds build outputs, `tmp/` holds temporary
files (pidfiles, scratch data, etc). Both are gitignored.

Docker is ready to go:

```sh
task build.docker       # build image
task build.docker.run   # build and run
```

See `Taskfile.yml` for available commands.

## Renaming

The project ships with an interactive rename wizard:

`./scripts/rename.sh`

This replaces the Go module/package name, the display name, and the kebab-case
project name across all source files.

**Note:** This is a one-way operation. To undo, use `git checkout .`.

## How it works

Server renders HTML with templ. Forms POST to the server, which processes and
redirects back. No client-side JS required — web components enhance where
needed.

- All generated web assets (`build.ts` bundles `lib/**/*.ts` into
  `web/static/bundle.js` and page-specific `.ts` files into
  `web/static/page-files/`, tailwindcss outputs `web/static/tailwind.css`) are
  embedded into the binary via `//go:embed web/static/*` in production builds.
  The entire `web/static/` directory is gitignored.
- Two build modes via Go build tags: production (`task build.go`) embeds all
  web assets and migrations into the binary. Dev mode (`task dev` with
  `-tags=noembed`) serves `web/static/` directly from disk with `Cache-Control: no-store`,
  so changes are visible on reload without a rebuild.
- Hash-based asset caching: the `hashfs` library (in `lib/hashfs`) renames
  files with a content hash (e.g. `bundle.abc123.js`). Use the `StaticRootPath`
  helper in templ to reference assets — it resolves to the hashed path in
  production and the plain path in dev.
- Web components with shadow DOM and shared TailwindCSS (and working dark mode
  toggling)
- Live reload for Go, templ, TypeScript, and TailwindCSS just by using `task dev`
- Dockerfile that builds a minimal scratch image
- golangci-lint, eslint, and prettier come preconfigured; run a full
  backend+frontend static, lint, and compile check with `task check`

Tech stack:

- [templ](https://templ.guide) - HTML templating
- [tailwindcss](https://tailwindcss.com/) - CSS styling
- [Lit](https://lit.dev/) - web components
- [go-chi](https://github.com/go-chi/chi) - HTTP router
- [goose](https://github.com/pressly/goose) - database migrations
- [sqlc](https://sqlc.dev/) - type-safe database queries
- [modernc.org/sqlite](https://gitlab.com/cznic/sqlite) - pure Go SQLite driver

## JavaScript bundling

`web/build.ts` (run automatically by `task dev` on any `.ts` change) produces
two kinds of bundles:

- **Shared bundle:** everything in `web/lib/**/*.ts` becomes a single
  `static/bundle.js`. This is where web components live, and it is loaded
  synchronously in `<head>` so all custom elements are registered before the
  body parses.
- **Page bundles:** a `.ts` file in any other `web/` subdirectory (e.g.
  `web/root/root.ts`, next to its `.templ`) becomes its own bundle at
  `static/page-files/<dir>/<name>.js`. Load it on just that page:

  ```templ
  <script src={ backwegotemplate.StaticRootPath("static/bundle.js") }></script>
  <script defer src={ backwegotemplate.StaticRootPath("static/page-files/root/root.js") }></script>
  ```

Page files are plain top-level browser code — no exports needed. One rule:
**don't import from `lib/` in page files.** The iife format has no code
splitting, so lib code would be duplicated into each page bundle, and
re-registering an already-defined custom element throws. Since `bundle.js`
loads first, page scripts can assume all components exist and interact with
them via the DOM.

## Database

Migrations live in `db/migrations/` (goose format), queries in `db/queries/*.sql`
(sqlc format). The workflow for schema changes:

1. Add a migration file to `db/migrations/` (e.g. `20240101120000_add_posts.sql`)
2. `task db.migrate` — applies it to your local `data/sqlite.db`
3. Add or update queries in `db/queries/`
4. `task gen.db` — regenerates type-safe Go code into `lib/generated/sqlc/`

The sqlc config is at `db/sqlc.yaml`. Migrations also run automatically on
server startup (disable via `DB_MIGRATE_ON_START=false`).

## Linting and checks

`task check` runs all checks in parallel: compile + golangci-lint for the go
code, and prettier + eslint + typescript + bundle build for the web code. The
git pre-push hook (installed by `task init`) runs `task check` as well.

golangci-lint notes:

- The version is pinned in `.golangci-version` and auto-installed into `bin/`
  by `task init`, so it is not a manual requirement.

## What next

From here you may want to:

- **Add a hypermedia framework:** [htmx](https://htmx.org/),
  [Datastar](https://data-star.dev/), or [Alpine
  AJAX](https://alpine-ajax.js.org/) gives you dynamic UI without writing JS.
  All play nice with web components. See https://htmx.org/essays/alternatives/
  for a list of other alternatives.
- **Swap the database:** change the driver and connection string in
  `cmd/serve/main.go` to use Postgres, MySQL, or whatever you prefer, then
  update the sqlc config at `./db/sqlc.yaml`
- **Switch to JSON logging:** replace `logging.NewHandler(...)` with
  `slog.NewJSONHandler(os.Stdout, ...)` in `cmd/serve/main.go` for
  production-ready JSON logs

## Project structure

```
.
├── .golangci.yml       lint config, version pin in .golangci-version
│
├── bin                 build output, gitignored
│
├── cmd
│   └── serve           go entrypoint
│
├── data                runtime sqlite data (gitignored inside)
│
├── Dockerfile          production container image
│
├── db                  sqlc and migrations
│
├── files_embed.go      embeds web/static for production builds
│
├── files_noembed.go    serves web/static from disk in dev mode, noembed tag
│
├── .hooks              git hooks, symlinked by task init
│
├── lib                 shared go libraries
│
├── scripts
│   ├── dev-run.sh      dev server runner
│   └── rename.sh       project rename wizard
│
├── Taskfile.yml        taskfile with all tasks
│
├── tmp                 temp files/pidfiles, gitignored
│
└── web
    ├── build.ts        script to build web assets, outputs to web/static
    ├── lib             shared typescript libraries (→ static/bundle.js)
    ├── root            templ root page (optional .ts → static/page-files/root/)
    └── static          build artifacts (bundle.js, page-files/, tailwind.css), gitignored
```

## Who this is for

I have tried to structure the template such that it is nice to use in general
for anybody, but it should be noted I have primarily optimized the template for
the tools and workflows I use in general:

1. Neovim 0.12+ with my custom config
2. Being very CLI-first
3. UNIX first, I have no plans of supporting Windows. It may work out of the box
   anyways, I haven't tested.

## License

[MIT](LICENSE)
