- Use the `tmp/` directory for temporary files when testing or experimenting
  (scratch scripts, test output, etc). It is gitignored.

- After doing changes, run static and build checks:
  - go code, run `task check.go`
  - web code, run `task check.web`
  - if both, run `task check` to check everything
