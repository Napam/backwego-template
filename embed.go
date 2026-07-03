//go:build !devlocal

package backwegotemplate

import (
	"backwegotemplate/lib/hashfs"
	"embed"
	"io/fs"

	"github.com/go-chi/chi/v5"
)

//go:embed web/static/*
var webFS embed.FS

//go:embed db/migrations/*
var migrationsFS embed.FS

var MigrationsFS fs.FS
var hashFS *hashfs.FS

func init() {
	stripped, err := fs.Sub(webFS, "web")
	if err != nil {
		panic("failed to strip prefix: " + err.Error())
	}
	hashFS = hashfs.NewFS(stripped)

	MigrationsFS, err = fs.Sub(migrationsFS, "db/migrations")
	if err != nil {
		panic("failed to strip migrations prefix: " + err.Error())
	}
}

// StaticRootPath returns a root-relative path with content hash for cache busting.
func StaticRootPath(path string) string {
	return "/" + hashFS.HashName(path)
}

// SetupStatic registers the static file server on the router.
func SetupStatic(r chi.Router) {
	r.Handle("/static/*", hashfs.FileServer(hashFS))
}
