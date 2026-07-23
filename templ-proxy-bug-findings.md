# templ live-reload proxy: "blank page" investigation

Findings from investigating why `localhost:7331` (the templ live-reload proxy)
stops working / serves a blank page when an agent makes a burst of edits,
while one-by-one edits work fine.

Environment: templ v0.3.1020 (latest release), wgo v0.6.4, go 1.26.5,
macOS arm64, branch `alternative-dev-run-sh`.

**TL;DR**

1. **Primary bug (confirmed, upstream, unfixed):** a race in templ's SSE
   handler makes the _entire templ process_ crash with
   `panic: send on closed channel`. The proxy lives inside that process, so
   the proxy dies with it. Nothing restarts it → `localhost:7331` refuses
   connections → blank/error page in the browser, permanently, until
   `task dev` is restarted.
2. **Secondary design flaws in templ's proxy** make the dev experience
   "weird" even when no crash happens: an ~11-minute retry budget means
   browser requests _hang_ (blank page + spinner) through every server-down
   window instead of failing fast, and reload events fired while the browser
   is mid-page-load are silently lost (stale final page possible).
3. The debouncing on this branch reduces event _rate_ but the crash needs
   event _coincidence_ (≥2 overlapping "reload" sends while a browser tab
   disconnects). With three independent notify sources, bursts still
   eventually produce that coincidence.

---

## 1. Root cause: `panic: send on closed channel` in templ's SSE handler

### 1.1 The code (templ v0.3.1020, `cmd/templ/generatecmd/sse/server.go`)

The proxy serves a Server-Sent-Events stream at `/_templ/reload/events`.
Each connected browser tab registers an **unbuffered** channel:

```go
type Handler struct {
	m        *sync.Mutex
	counter  int64
	requests map[int64]chan event
}

// Send an event to all connected clients.
func (s *Handler) Send(eventType string, data string) {
	s.m.Lock()
	defer s.m.Unlock()
	for _, f := range s.requests {
		f := f
		go func(f chan event) {
			f <- event{          // blocking send on an unbuffered channel
				Type: eventType,
				Data: data,
			}
		}(f)
	}
}
```

And in `ServeHTTP`, when a client disconnects:

```go
defer func() {
	s.m.Lock()
	defer s.m.Unlock()
	delete(s.requests, id)
	close(events)              // <-- channel closed here
}()
```

### 1.2 The race

The browser-side script injected by the proxy
(`cmd/templ/generatecmd/proxy/script.js`) is:

```js
templ_reloadSrc.onmessage = (event) => {
  if (event && event.data === "reload") {
    window.location.reload();
  }
};
window.onbeforeunload = () => window.templ_reloadSrc.close();
```

Sequence that triggers the panic (two near-simultaneous `Send` calls, one
browser tab):

| Step | What happens | State of goroutine 2 |
|------|-------------|---------------------|
| 1 | **Send #1** fires — spawns goroutine 1, which sends on the unbuffered `events` channel | — |
| 2 | Read loop receives the event, writes to response, flushes to browser | — |
| 3 | Browser receives `"reload"` → `window.location.reload()` → `onbeforeunload` → `EventSource.close()` → connection drops → request context cancelled | — |
| 4 | **Send #2** fires — spawns goroutine 2, which tries to send on the same `events` channel | **Blocked** — read loop is about to exit, no receiver |
| 5 | Read loop picks `<-r.Context().Done()` → exits → deferred cleanup runs → `close(events)` | **Still blocked** on `f <- event{...}` |
| 6 | `close(events)` hits while goroutine 2 is sending on it → **`panic: send on closed channel`** | Dead |

Why two sends are needed: one send is consumed instantly by the parked
reader (step 2), so it finishes before the cleanup. The second send has no
receiver (the loop already exited) and is still parked when the channel
closes.

The race exists because `Send` spawns the goroutine and immediately
releases the mutex — it doesn't wait for the send to complete. The cleanup
closes the channel with no coordination with in-flight send goroutines.

The race needs **≥2 pending send goroutines at the moment a tab
disconnects**. A single, spaced-out reload event is always received
instantly by the parked handler loop, so one-by-one edits never trigger
it. Bursts of near-simultaneous sends do.

### 1.3 Why the panic kills the whole proxy

The panicking goroutine is spawned by `Send` — it is **not** an
`http.Server` handler goroutine, so `net/http`'s per-connection panic
recovery does not apply. An unrecovered panic in any goroutine terminates
the process. The templ process hosts the file watcher, the generator, the
`--cmd` runner **and the proxy** — all of it dies at once.

Observed outcome: `curl http://localhost:7331/` goes from `200 OK` to
`Connection refused` (curl exit code 7). A browser tab on
`localhost:7331` shows a connection-error / blank page. The death is
**silent**: `dev.go` runs templ with `ignore_error: true`, so Task does
not report the session as failed, and the tailwind/web/sql/server
watchers keep running as if nothing happened.

### 1.4 Why agent bursts trigger it (and manual edits don't)

This dev setup has **three independent "reload" notify sources**, each of
which ends in `sse.Send("message", "reload")`:

| Source          | Trigger                                                       | Path                                                            |
| --------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| templ itself    | every grouped post-generation event with `needsBrowserReload` | `handlePostGenerationEvents` → `p.SendSSE("message", "reload")` |
| `dev.web` (wgo) | every js/css rebuild                                          | `templ generate --notify-proxy` → POST `/_templ/reload/events`  |
| `dev-run.sh`    | every server restart                                          | waits for `:8080`, then `--notify-proxy` → POST                 |

Each open browser tab multiplies the pending-send count (one goroutine
per tab per send). Manual editing produces one send every few seconds —
never two pending at a disconnect. An agent editing `.templ` + `.go` +
`.ts` files in quick succession makes 2–3 sends land in the same window
in which a tab is disconnecting to reload. One unlucky coincidence per
long session is enough to kill the proxy.

### 1.5 Upstream status

- Present in v0.3.1020 (the latest release at time of writing).
- Verified still present on `main` (`raw.githubusercontent.com/a-h/templ/main/cmd/templ/generatecmd/sse/server.go`
  fetched 2026-07-23 — identical code).
- No issue filed for _this_ site. Searching "send on closed channel" does
  find [#505](https://github.com/a-h/templ/issues/505) — same panic string,
  different code path (`generatecmd/cmd.go` error handler, fixed Feb 2024) —
  so cite it when filing to preempt a duplicate close.
- Upgrading templ will **not** fix this; it needs an upstream patch (or a
  local workaround — see §5).

---

## 2. Evidence

### 2.1 Unit-level reproduction (deterministic)

`bug-findings-appendix/sse-repro/main.go` (own module, imports templ's `sse` package):
starts an `httptest` server, connects a client that reads one event and
disconnects (exactly what `script.js` does on reload), while 4 goroutines
flood `Send` — like the multiple notify sources during a burst.

Result (immediate, first rounds):

```
panic: send on closed channel

goroutine 129 [running]:
github.com/a-h/templ/cmd/templ/generatecmd/sse.(*Handler).Send.func1(0x0?)
	.../templ@v0.3.1020/cmd/templ/generatecmd/sse/server.go:37 +0x38
created by github.com/a-h/templ/cmd/templ/generatecmd/sse.(*Handler).Send in goroutine 25
	.../templ@v0.3.1020/cmd/templ/generatecmd/sse/server.go:36 +0xf0
exit status 2
```

Run it with: `cd bug-findings-appendix/sse-repro && GOPROXY=off go run .`

### 2.2 End-to-end reproduction (`task dev`)

With a real `task dev` session running:

- `bug-findings-appendix/browser-sim.sh` — simulated browser tabs: load the page through
  the proxy, open the SSE stream, close it on the first `data: reload`
  (what `script.js` + `location.reload()` do), repeat.
- `bug-findings-appendix/agent-burst.sh` — 60 rounds of multi-file edits
  (`.templ` text-only/structural + `.go` + `.ts`), 150 ms apart.
- `bug-findings-appendix/chaos.sh` — 6 tabs + real edits + bursts of direct POSTs to
  `/_templ/reload/events` (time-compressed version of what the three
  notify sources produce during a burst).

Result: the real templ watcher process crashed with the exact panic
(goroutine numbers ~13k prove it is the long-running watcher, captured in
`bug-findings-appendix/dev-session.log`):

```
panic: send on closed channel

goroutine 13141 [running]:
github.com/a-h/templ/cmd/templ/generatecmd/sse.(*Handler).Send.func1(0x6f2ef82f6c40?)
	.../templ@v0.3.1020/cmd/templ/generatecmd/sse/server.go:37 +0x38
created by github.com/a-h/templ/cmd/templ/generatecmd/sse.(*Handler).Send in goroutine 13023
	.../templ@v0.3.1020/cmd/templ/generatecmd/sse/server.go:36 +0xf0
```

Afterwards: `nc -z localhost 7331` fails, `curl` → `000 (0.0001s)` rc=7
(connection refused). The tailwind/web/sql watchers and the dev server
kept running — only the proxy/watcher was gone.

Timing note: gentle bursts (one file type at a time, 250 ms apart) did
**not** crash it; the crash needs the tighter coincidence that real agent
edits produce. This matches the report "one by one works, agents break
it".

---

## 3. Secondary flaws in templ's proxy (matter even without the crash)

### 3.1 ~11-minute retry budget: requests hang instead of failing

`cmd/templ/generatecmd/proxy/proxy.go` uses a custom RoundTripper:

```go
p.Transport = &roundTripper{
	maxRetries:      20,
	initialDelay:    100 * time.Millisecond,
	backoffExponent: 1.5,
}
```

While the upstream (`:8080`) is down, every browser request retries
`20 × (100ms × 1.5^n)` ≈ **664.9 s ≈ 11.1 minutes** before the proxy
returns `502 Bad Gateway` **with an empty body** — which a browser renders
as a literally blank white page.

Verified live: with a deliberately broken build (server down), a request
through the proxy hung with no response at all (`curl --max-time 25`
timed out with code `000`). The browser experience during any server-down
window is "blank tab with a spinner", indistinguishable from a dead
proxy.

Related: the retry loop clones the request with the (possibly canceled)
browser context but keeps sleeping/retrying anyway, so every request the
browser aborts leaks a goroutine for up to ~11 minutes. Also: on a 502 the
loop retries **without closing `resp.Body`** (the `continue` path in
`RoundTrip`), leaking up to 20 connections per hung request.

### 3.2 wgo does not retry failed builds

Checked what happens when `dev-run.sh`'s `go build` fails: exactly one
`build failed` line, then nothing — wgo stays parked waiting for the next
file event. Verified against source: in `wgo@v0.6.4/wgo_cmd.go:557-573` the
`break` in the `case err := <-cmdResult:` arm only breaks the `select`, so
the command chain is not re-run. Combined with 3.1: a build error left
behind by an agent (routine mid-burst, while later files haven't been
edited yet) means the server is down until the next save, and every
browser request in that window hangs.

### 3.3 Lost reload events

`templ`/`--notify-proxy` sends are fire-and-forget to _currently
connected_ SSE clients. While the browser's page load is hanging in the
retry loop (3.1), there is no SSE connection, so any reload event fired
in that window is silently dropped. A burst can therefore end on a stale
page: the last notify fires while the browser is still waiting for its
GET, the GET then completes from a server that has since been replaced,
and no further reload ever arrives.

---

## 4. Assessment of this branch's debouncing

What the branch (`alternative-dev-run-sh`) improved, and why the proxy
"becomes weird anyways":

**What works**

- wgo (`dev.server`) owning the server lifecycle + `bug-findings-appendix/restart.trigger`
  handoff from templ's `--cmd` removes the old dual-parenting mess.
- Debounces (wgo 512 ms server / 256 ms web/sql; templ's own 100 ms
  grouping) collapse most redundant rebuilds.
- `dev-run.sh` notifying the proxy only after `:8080` actually answers
  removes reload-into-nothing in the common case.
- Boot-time port checks refuse to start over orphaned processes.

**What remains broken, and why**

1. **The crash (§1).** Debouncing lowers send _rate_; the bug needs send
   _coincidence_. Three notify sources × N tabs means bursts still
   eventually produce ≥2 pending sends during a tab disconnect. One
   coincidence → templ dead → proxy dead → blank page at 7331 until
   `task dev` is restarted. `ignore_error: true` hides the corpse.
2. **Kill-first restarts + 11-min retry budget = guaranteed hang
   windows.** `dev-run.sh restart` deliberately pkills the server before
   wgo rebuilds (to avoid serving a broken render from half-rewritten
   `_templ.txt` — see commit d0df320), so _every_ structural change has a
   server-down window in which browser requests hang (§3.1). Mid-burst
   compile errors stretch the window until the next save (§3.2).
3. **Stale end states.** Reloads fired during a hang window are lost
   (§3.3); a burst can finish on a stale page even when nothing crashed.

---

## 5. Fix directions

Not applied — options, roughly ordered by effort/benefit:

1. **Supervise templ in `dev.go`** — run it in a restart loop
   (`until go tool templ generate ...; do sleep 1; done`). A panic then
   self-heals in ~1 s. The existing `go.mod` watch-pattern already
   re-bootstraps the lazily-started proxy on restart. Cheap, robust,
   keeps the bug but makes it nearly invisible.
2. **Cut to one notify source** — keep only `dev-run.sh`'s
   after-server-up notify; drop `dev.web`'s `--notify-proxy` (templ's own
   `SendSSE` can't be disabled when the proxy is on). Shrinks the
   coincidence window; does not eliminate it.
3. **Patch/report upstream** — fix worked out in `templ-proxy-fix-draft.md`
   §1: per-client `done` channel + `select { case f <- event: case <-done: }`,
   and never `close(events)`. This keeps blocking semantics (no dropped
   events for live clients), unlike the cruder buffered-channel + `select`/
   `default` drop variant. `bug-findings-appendix/sse-repro/main.go` is a
   ready-made repro to attach to an issue/PR in `a-h/templ`.
4. **Replace templ's proxy with a small custom live-reload proxy** —
   ~100 lines: reverse proxy + script injection + SSE endpoint with a
   correct send loop, plus fast-fail (short retry budget) when the
   upstream is down. Eliminates §1 and §3.1 at once and makes the dev
   loop independent of upstream bugs, at the cost of owning that code.

---

## Appendix

- Synthetic repro: `bug-findings-appendix/sse-repro/main.go` (`GOPROXY=off go run .` inside
  `bug-findings-appendix/sse-repro/`).
- E2E scripts: `bug-findings-appendix/browser-sim.sh`, `bug-findings-appendix/agent-burst.sh`, `bug-findings-appendix/chaos.sh`.
- Captured session log with the panic stack: `bug-findings-appendix/dev-session.log`.
- Key upstream files (module cache):
  - `github.com/a-h/templ@v0.3.1020/cmd/templ/generatecmd/sse/server.go`
    — the racy `Send` / `close`.
  - `github.com/a-h/templ@v0.3.1020/cmd/templ/generatecmd/proxy/proxy.go`
    — retry RoundTripper (`maxRetries: 20, initialDelay: 100ms,
backoffExponent: 1.5`), `ModifyResponse`, SSE wiring.
  - `github.com/a-h/templ@v0.3.1020/cmd/templ/generatecmd/proxy/script.js`
    — browser-side reload + `onbeforeunload` close.
- Retry-budget math: `Σ 100ms·1.5ⁿ, n=0..19 = 100ms·(1.5²⁰−1)/0.5 ≈ 664.9 s`.
- Independent second-opinion re-verification (2026-07-23): repro re-run
  panics in round 1 with the documented stack; `sse/server.go` diffed
  byte-identical between the v0.3.1020 module cache and `main`; GitHub
  commit history for the file lists only #130 (2023-08) and #470 (2024-01);
  §3.2 confirmed against `wgo@v0.6.4` source; #505/#842 checked on the
  upstream tracker (see §1.5 and fix-draft §4).
