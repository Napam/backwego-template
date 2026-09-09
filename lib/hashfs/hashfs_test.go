package hashfs

import (
	"errors"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func testFS() *FS {
	return NewFS(fstest.MapFS{
		"static/app.js":          {Data: []byte("console.log(1)")},
		"static/app.tar.gz":      {Data: []byte("archive")},
		"static/readme":          {Data: []byte("readme")},
		"static/assets/logo.svg": {Data: []byte("<svg/>")},
	})
}

func TestInsertHash(t *testing.T) {
	tests := []struct{ name, want string }{
		{"app.js", "app-HASH.js"},
		{"app.tar.gz", "app-HASH.tar.gz"},
		{"app", "app-HASH"},
		{"static/assets/logo.svg", "static/assets/logo-HASH.svg"},
	}
	for _, tt := range tests {
		if got := insertHash(tt.name, "HASH"); got != tt.want {
			t.Errorf("insertHash(%q) = %q, want %q", tt.name, got, tt.want)
		}
	}
}

func TestParseHashRoundTrip(t *testing.T) {
	names := []string{
		"static/app.js",
		"static/app.tar.gz",
		"static/readme",
		"static/assets/logo.svg",
	}
	for _, name := range names {
		hashed := insertHash(name, "0123456789abcdef")
		base, hash := parseHash(hashed)
		if base != name {
			t.Errorf("parseHash(%q) base = %q, want %q", hashed, base, name)
		}
		if hash != "0123456789abcdef" {
			t.Errorf("parseHash(%q) hash = %q, want %q", hashed, hash, "0123456789abcdef")
		}
	}
}

func TestParseHashRejectsUnhashed(t *testing.T) {
	for _, name := range []string{"static/app.js", "static/app-xyz.js", "", "."} {
		if _, hash := parseHash(name); hash != "" {
			t.Errorf("parseHash(%q) returned hash %q, want none", name, hash)
		}
	}
}

func TestHashName(t *testing.T) {
	fsys := testFS()

	hashed := fsys.HashName("static/app.js")
	if hashed == "static/app.js" {
		t.Fatal("HashName did not hash an existing file")
	}
	if got := fsys.HashName("static/app.js"); got != hashed {
		t.Errorf("HashName is not stable: %q then %q", hashed, got)
	}
	if got := fsys.HashName("static/missing.js"); got != "static/missing.js" {
		t.Errorf("HashName(missing) = %q, want name unchanged", got)
	}
	if _, hash := parseHash(hashed); len(hash) != hashLength {
		t.Errorf("hash length = %d, want %d", len(hash), hashLength)
	}
}

func TestOpenResolvesHashedName(t *testing.T) {
	fsys := testFS()

	f, err := fsys.Open(fsys.HashName("static/app.js"))
	if err != nil {
		t.Fatalf("Open(hashed) error: %v", err)
	}
	_ = f.Close()

	wrong := insertHash("static/app.js", "0000000000000000")
	if _, err := fsys.Open(wrong); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("Open(wrong hash) error = %v, want fs.ErrNotExist", err)
	}
}

func TestFileServer(t *testing.T) {
	fsys := testFS()
	srv := httptest.NewServer(FileServer(fsys))
	defer srv.Close()

	get := func(path string) *http.Response {
		resp, err := http.Get(srv.URL + path)
		if err != nil {
			t.Fatalf("GET %s: %v", path, err)
		}
		return resp
	}

	t.Run("HashedIsCached", func(t *testing.T) {
		resp := get("/" + fsys.HashName("static/app.js"))
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
		if got := resp.Header.Get("Cache-Control"); got != "public, max-age=31536000" {
			t.Errorf("Cache-Control = %q", got)
		}
		if resp.Header.Get("ETag") == "" {
			t.Error("missing ETag")
		}
	})

	t.Run("PlainIsNotCached", func(t *testing.T) {
		resp := get("/static/app.js")
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
		if got := resp.Header.Get("Cache-Control"); got != "" {
			t.Errorf("Cache-Control = %q, want empty", got)
		}
	})

	t.Run("Missing", func(t *testing.T) {
		resp := get("/static/nope.js")
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("status = %d, want 404", resp.StatusCode)
		}
	})

	t.Run("Directory", func(t *testing.T) {
		resp := get("/static/assets")
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("status = %d, want 403", resp.StatusCode)
		}
	})

	t.Run("Root", func(t *testing.T) {
		resp := get("/")
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("status = %d, want 403", resp.StatusCode)
		}
	})
}
