# Backwego Project Template

Opinionated template for SSR-first Go apps using templ for HTML, tailwind for styling, sqlite for data, goose migrations, all compiled into a single binary.

Requirements:

- go
- task
- [bun](https://bun.com/) - for frontend asset building

Tech stack:

- [templ](https://templ.guide) - HTML templating
- [tailwindcss](https://tailwindcss.com/) - CSS styling
- [go-chi](https://github.com/go-chi/chi) - HTTP router
- [goose](https://github.com/pressly/goose) - database migrations
- [sqlc](https://sqlc.dev/) - type-safe database queries
- [modernc.org/sqlite](https://gitlab.com/cznic/sqlite) - pure Go SQLite driver

Features:

- Embedded web assets in the binary (place files in `web/static`)
- Hash-based asset caching for cache busting

See `Taskfile.yml` for available commands.

# Quickstart

1. Clone the repo
2. In repo root run `task dev`
3. Site with hot reload is at `localhost:7331`
