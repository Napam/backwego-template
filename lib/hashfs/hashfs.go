// Package hashfs serves static files under a content-addressed name so they
// can be cached forever: "static/app.js" is served as "static/app-<hash>.js",
// and changing the file changes the URL.
//
// Adapted from github.com/benbjohnson/hashfs (MIT, Copyright (c) 2020 Ben
// Johnson); see LICENSE in this directory.
package hashfs

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

// hashLength is how many hex characters of the SHA-256 sum to keep in the
// filename. SHA-256 is 64 hex chars; a shorter name is easier to read and
// still collision-safe for static assets. Must be 1..64.
const hashLength = 16

// hashedSuffix matches the trailing "-<hash>" of a hashed name.
var hashedSuffix = regexp.MustCompile(`-[0-9a-f]{` + strconv.Itoa(hashLength) + `}$`)

// cacheForever is sent for hashed URLs. The URL changes whenever the file does,
// so browsers can cache the response for a year.
const cacheForever = "public, max-age=31536000"

// FS resolves content-hashed names for an underlying file system.
type FS struct {
	fsys fs.FS

	mu     sync.RWMutex
	hashed map[string]string // original path -> hashed path
}

// Ensure FS implements fs.FS.
var _ fs.FS = (*FS)(nil)

// NewFS wraps fsys and caches the hashed name of each file it looks up.
func NewFS(fsys fs.FS) *FS {
	return &FS{fsys: fsys, hashed: make(map[string]string)}
}

// HashName returns name with its content hash inserted before the extension,
// for example "app.js" -> "app-<hash>.js". It returns name unchanged if the
// file cannot be read.
func (fsys *FS) HashName(name string) string {
	fsys.mu.RLock()
	hashed, ok := fsys.hashed[name]
	fsys.mu.RUnlock()
	if ok {
		return hashed
	}

	data, err := fs.ReadFile(fsys.fsys, name)
	if err != nil {
		return name
	}
	sum := sha256.Sum256(data)
	hashed = insertHash(name, hex.EncodeToString(sum[:])[:hashLength])

	fsys.mu.Lock()
	fsys.hashed[name] = hashed
	fsys.mu.Unlock()
	return hashed
}

// Open opens name, resolving a hashed name to the file it addresses.
func (fsys *FS) Open(name string) (fs.File, error) {
	f, _, err := fsys.open(name)
	return f, err
}

// open also reports the hash contained in a hashed name, which the file server
// uses to decide how long the response may be cached.
func (fsys *FS) open(name string) (fs.File, string, error) {
	base, hash := parseHash(name)
	if hash == "" || fsys.HashName(base) != name {
		// Not a hashed name, or the hash does not match: serve it literally.
		base, hash = name, ""
	}
	f, err := fsys.fsys.Open(base)
	return f, hash, err
}

// insertHash inserts hash before name's extension:
// "app.js" -> "app-<hash>.js", "app" -> "app-<hash>",
// "app.tar.gz" -> "app-<hash>.tar.gz".
func insertHash(name, hash string) string {
	dir, base := path.Split(name)
	if i := strings.Index(base, "."); i != -1 {
		base = base[:i] + "-" + hash + base[i:]
	} else {
		base += "-" + hash
	}
	return dir + base
}

// parseHash splits a hashed name into its base path and hash. It returns an
// empty hash if name is not in hashed form.
func parseHash(name string) (base, hash string) {
	dir, file := path.Split(name)

	head, ext := file, ""
	if i := strings.Index(file, "."); i != -1 {
		head, ext = file[:i], file[i:]
	}
	if !hashedSuffix.MatchString(head) {
		return "", ""
	}

	hash = head[len(head)-hashLength:]
	return dir + head[:len(head)-hashLength-1] + ext, hash
}

// FileServer returns an http.Handler that serves fsys. Files requested by
// their hashed name get a long-lived cache header; other files do not.
func FileServer(fsys *FS) http.Handler {
	return &fileServer{fsys: fsys}
}

type fileServer struct {
	fsys *FS
}

func (h *fileServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if name == "" {
		name = "."
	}

	f, hash, err := h.fsys.open(name)
	if errors.Is(err, fs.ErrNotExist) {
		http.Error(w, "404 page not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "500 Internal Server Error", http.StatusInternalServerError)
		return
	}
	defer func() { _ = f.Close() }()

	// Directories are not listed.
	info, err := f.Stat()
	if err != nil {
		http.Error(w, "500 Internal Server Error", http.StatusInternalServerError)
		return
	} else if info.IsDir() {
		http.Error(w, "403 Forbidden", http.StatusForbidden)
		return
	}

	if hash != "" {
		w.Header().Set("Cache-Control", cacheForever)
		w.Header().Set("ETag", `"`+hash+`"`)
	}

	if rs, ok := f.(io.ReadSeeker); ok {
		http.ServeContent(w, r, name, info.ModTime(), rs)
		return
	}

	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = io.Copy(w, f)
	}
}
