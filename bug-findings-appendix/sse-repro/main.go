// Reproduce the templ sse.Handler race: Send spawns a goroutine per client
// that blocks sending on an unbuffered channel. When the client disconnects,
// ServeHTTP's cleanup closes that channel — any still-blocked send goroutine
// panics ("send on closed channel") and crashes the WHOLE templ process,
// killing the live-reload proxy.
package main

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"time"

	"github.com/a-h/templ/cmd/templ/generatecmd/sse"
)

func main() {
	for round := 0; round < 2000; round++ {
		h := sse.New()
		srv := httptest.NewServer(h)

		// Client connects, reads one event, then disconnects immediately —
		// exactly what script.js does on window.location.reload()
		// (onbeforeunload closes the EventSource).
		resp, err := http.Get(srv.URL)
		if err != nil {
			panic(err)
		}

		// Flood reload events: in dev these come from templ's own SendSSE,
		// `templ generate --notify-proxy` (dev-run.sh), and the js watcher —
		// several can land while only one client is connected.
		stop := make(chan struct{})
		for g := 0; g < 4; g++ {
			go func() {
				for {
					select {
					case <-stop:
						return
					default:
						h.Send("message", "reload")
					}
				}
			}()
		}

		// Read one event (like the browser receiving "reload")...
		buf := make([]byte, 64)
		_, _ = resp.Body.Read(buf)
		// ...then disconnect, like a browser reloading the page.
		_ = resp.Body.Close()

		time.Sleep(2 * time.Millisecond)
		close(stop)
		srv.Close()
		_, _ = io.Copy(io.Discard, resp.Body)
	}
	fmt.Println("no panic in 2000 rounds")
}
