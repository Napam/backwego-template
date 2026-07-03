package backwegotemplate

import (
	"backwegotemplate/lib/hashfs"
	"embed"
	"io/fs"
)

//go:embed web/static/*
var webFS embed.FS

//go:embed db/migrations/*
var migrationsFS embed.FS

var MigrationsFS fs.FS
var HashFS *hashfs.FS

func init() {
	stripped, err := fs.Sub(webFS, "web")
	if err != nil {
		panic("failed to strip prefix: " + err.Error())
	}
	HashFS = hashfs.NewFS(stripped)

	MigrationsFS, err = fs.Sub(migrationsFS, "db/migrations")
	if err != nil {
		panic("failed to strip migrations prefix: " + err.Error())
	}
}
