# Backwego Project Template

Opinionated template for SSR-first Go apps using templ for HTML, tailwind for
styling, Lit for web components, sqlite for data, goose migrations, all compiled
into a single binary.

Requirements:

- [go](https://go.dev)
- [task](https://taskfile.dev)
- [bun](https://bun.com/) - for frontend asset building

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
- Hot reload for Go, templ, TypeScript, and TailwindCSS just by using `task dev`
- Dockerfile for building scratch image ready
- eslint and prettier comes preconfigured

See `Taskfile.yml` for available commands.

## How it works

Server renders HTML with templ. Forms POST to the server, which processes and
redirects back. No client-side JS required — web components enhance where
needed.

## Quickstart

1. Clone the repo
2. In repo root run `task dev`
3. Site with hot reload is at `localhost:7331`

For production build: `task build.go` (output in `bin/app`).

Docker is ready to go:

```
task build.docker       # build image
task build.docker.run   # build and run
```

## Renaming

Run the interactive rename wizard:

`./rename.sh`

This replaces `backwegotemplate` → your name, `Backwego Template` → your display
name, `backwego-template` → your kebab-case name across all source files.

**Note:** This is a one-way operation. To undo, use `git checkout .`.

## Project structure

```
cmd/serve/    entry point, routes
web/          frontend (components, templates, styles)
db/           migrations and sqlc queries
lib/          shared libraries (embed, logging)
```

## What next

From here you'll probably want to:

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

## This template is mostly made for myself (that is, neovim heavy setup)

I have tried to structure the template such that it is nice to use in general
for anybody, but is should be noted I have primarily optimized the template for
the tools I use in general:

1. Neovim 0.12+ with my custom config
2. Being very CLI-first
3. UNIX first, I have no plans of supporting Windows. It may work out of the box
   anyways, I haven't tested.
