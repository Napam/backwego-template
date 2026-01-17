package backwegotemplate

import (
	"embed"
	"backwegotemplate/lib/hashfs"
	"io/fs"
)

//go:embed web/static/*
var webFS embed.FS

var HashFS *hashfs.FS

func init() {
	stripped, err := fs.Sub(webFS, "web")
	if err != nil {
		panic("failed to strip prefix: " + err.Error())
	}

	HashFS = hashfs.NewFS(stripped)
}
