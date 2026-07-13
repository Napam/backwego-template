# Backwego Project Template

Opinionated template for SSR-first Go apps using templ for HTML, tailwindcss for
styling, Lit for web components, sqlite for data, goose migrations, all compiled
into a single binary.

This template is a base for hypermedia driven applications, and fits very well
with frameworks such as [htmx](https://htmx.org/).

Requirements:

- [go](https://go.dev)
- [task](https://taskfile.dev)
- [bun](https://bun.com/) - for frontend asset building

## Quickstart

1. In repo root run `task dev`
   - This will automatically setup git pre-push hook
1. Site with live reload is at `localhost:7331`
1. Application entrypoint is at `cmd/serve/main.go`, frontend root page is at
   `web/root/root.templ`. They are good starting points to start making changes.

For production build: `task build.go` (output in `bin/app`).

Directory conventions: `bin/` holds build outputs, `tmp/` holds temporary
files (pidfiles, scratch data, etc). Both are gitignored.

Docker is ready to go:

```
task build.docker       # build image
task build.docker.run   # build and run
```

See `Taskfile.yml` for available commands.

## How it works

Server renders HTML with templ. Forms POST to the server, which processes and
redirects back. No client-side JS required — web components enhance where
needed.

Tech stack:

- [templ](https://templ.guide) - HTML templating
- [tailwindcss](https://tailwindcss.com/) - CSS styling
- [Lit](https://lit.dev/) - web components
- [go-chi](https://github.com/go-chi/chi) - HTTP router
- [goose](https://github.com/pressly/goose) - database migrations
- [sqlc](https://sqlc.dev/) - type-safe database queries
- [modernc.org/sqlite](https://gitlab.com/cznic/sqlite) - pure Go SQLite driver

Features:

- Embedded web assets in the binary (place files in `web/static`)
- Hash-based asset caching for cache busting
- Web components with shadow DOM and shared TailwindCSS (and working dark mode
  toggling)
- Live reload for Go, templ, TypeScript, and TailwindCSS just by using `task dev`
- Dockerfile for building scratch image ready
- eslint and prettier comes preconfigured, one can do a full backend+frontend
  static and compile check with `task check`

## Renaming

A script is made for quick renaming of the project. Run the interactive rename wizard:

`./scripts/rename.sh`

This replaces `backwegotemplate` → your name, `Backwego Template` → your display
name, `backwego-template` → your kebab-case name across all source files.

**Note:** This is a one-way operation. To undo, use `git checkout .`.

## What next

From here you may want to:

- **Add a hypermedia framework** — [htmx](https://htmx.org/),
  [Datastar](https://data-star.dev/), or [Alpine
  AJAX](https://alpine-ajax.js.org/) gives you dynamic UI without writing JS.
  All play nice with web components. See https://htmx.org/essays/alternatives/
  for a list of other alternatives.
- **Swap the database** — change the driver and connection string in
  `cmd/serve/main.go` to use Postgres, MySQL, or whatever you prefer, then
  update the sqlc config at `./db/sqlc.yaml`
- **Switch to JSON logging** — replace `logging.NewHandler(...)` with
  `slog.NewJSONHandler(os.Stdout, ...)` in `cmd/serve/main.go` for
  production-ready JSON logs

## Project structure

```
.
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
├── files_noembed.go    empty embed stub for dev mode, noembed tag
│
├── lib                 shared go libraries
│
├── scripts
│   ├── dev-run.sh      dev server runner
│   └── rename.sh       project rename wizard
│
├── Taskfile.yml        taskfile with every tasks
│
├── tmp                 temp files/pidfiles, gitignored
│
└── web
    ├── build.ts        script to build web assets, outputs to web/static
    ├── lib             shared typescript libraries
    ├── root            templ root page
    └── static          this dir will be embedded into go binary
```

## This template is mostly made for myself

I have tried to structure the template such that it is nice to use in general
for anybody, but it should be noted I have primarily optimized the template for
the tools and workflows I use in general:

1. Neovim 0.12+ with my custom config
2. Being very CLI-first
3. UNIX first, I have no plans of supporting Windows. It may work out of the box
   anyways, I haven't tested.
