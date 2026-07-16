- Use the `tmp/` directory for temporary files when testing or experimenting
  (scratch scripts, test output, etc). It is gitignored.

- Keep yourself updated with what is in Taskfile.yml in order to ensure that you
  run correct commands.

- After doing changes, run static and build checks:
  - go code, run `task check.go`
  - web code, run `task check.web`
  - if both, run `task check` to check everything

- Go formatting issues reported by golangci-lint (gofumpt, gci, golines) can
  be auto-fixed with `./bin/golangci-lint fmt` (installed by `task init.go`)
