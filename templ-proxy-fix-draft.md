# templ live-reload proxy: fix draft

Fix for the `panic: send on closed channel` race in templ's SSE handler
(see `templ-proxy-bug-findings.md` §1 for the diagnosis). Verified against
templ v0.3.1020 and current `main` — the buggy code is byte-identical in both,
and the `Send` method has not changed since the original hot-reload commits
(#130 in 2023, #470 in Jan 2024), so this has been latent for ~2.5 years.

**File:** `cmd/templ/generatecmd/sse/server.go` (upstream `a-h/templ`).

---

## 1. Root cause (recap)

`Send` holds the mutex only long enough to *spawn* one goroutine per client;
the actual `f <- event` runs **outside the mutex**, in a detached goroutine,
on an **unbuffered** channel. The disconnect cleanup takes the mutex, deletes the id,
and `close(events)`. Nothing coordinates a still-parked send goroutine with
that close → `panic: send on closed channel`. Because the panicking goroutine
is spawned by `Send` (not an `http.Server` handler goroutine), `net/http`'s
per-connection `recover` does not catch it, so the whole templ process dies.

The precise trigger is *"a send goroutine still blocked on the send at the
instant `close` runs."* A single spaced-out event is consumed instantly by the
parked reader, so it never lingers — which is why one-by-one edits are safe and
bursts (≥2 near-simultaneous sends) crash it.

---

## 2. The fix

Give each connection a `done` signal, `select` on it in the send goroutine,
and **never close the events channel** (let GC reclaim it). ~15 lines, no
behavioral downside.

### 2.1 Track a `done` channel per client

```go
type client struct {
	events chan event
	done   chan struct{}
}

type Handler struct {
	m        *sync.Mutex
	counter  int64
	requests map[int64]client
}

func New() *Handler {
	return &Handler{
		m:        new(sync.Mutex),
		requests: map[int64]client{},
	}
}
```

### 2.2 Make the send abandonable

```go
func (s *Handler) Send(eventType string, data string) {
	s.m.Lock()
	defer s.m.Unlock()
	for _, c := range s.requests {
		c := c
		go func(c client) {
			select {
			case c.events <- event{Type: eventType, Data: data}:
			case <-c.done: // client is gone — abandon instead of blocking forever
			}
		}(c)
	}
}
```

### 2.3 Close `done` on disconnect — but not `events`

```go
	id := atomic.AddInt64(&s.counter, 1)
	events := make(chan event)
	done := make(chan struct{})
	s.m.Lock()
	s.requests[id] = client{events: events, done: done}
	s.m.Unlock()
	defer func() {
		s.m.Lock()
		delete(s.requests, id)
		s.m.Unlock()
		close(done) // wakes every parked sender; events is never closed
	}()
```

The read loop is unchanged — `case e := <-events:` still works.

---

## 3. Why this is correct

- **No send-on-closed panic** — `events` is never closed, so the send can't
  panic. It's just an unreferenced channel after the handler returns; GC
  reclaims it. Note the original `close(events)` was *functionally dead*: it
  runs in the deferred cleanup, after the read loop has already exited, so no
  reader ever observes it — it existed only as a hazard for parked senders.
- **No leaked/blocked send goroutines** — the old code left a parked
  `f <- event` that would panic (or, absent the close, leak). Now every parked
  sender falls through `<-c.done` the instant the client disconnects.
- **No lost deliveries to live clients** — keeps blocking (unbuffered)
  semantics: a reload is delivered as long as the client is still connected;
  only genuinely-gone clients are skipped.
- **Map stays consistent** — `delete` happens under the mutex, so new `Send`
  calls never see a dead client. An in-flight `Send` that already captured `c`
  is safe because of the `select`.
- **Ordering is airtight** — `close(done)` runs only after the read loop has
  exited, so a parked sender's `select` can never deliver to a dead client,
  nor block past teardown. `done` is per-connection and closed exactly once
  (in the defer), so no double-close.

Equivalent minimal variant, if upstream prefers: store the request's
`context.Context` per client and `select` on `ctx.Done()` in the send
goroutine instead of a dedicated `done` channel — same guarantees. The
`done` channel is used here because the close is explicit and exactly-once.

---

## 4. Regression test

`bug-findings-appendix/sse-repro/main.go` is a self-contained reproduction: it
starts an `httptest` server, connects a client that reads one event and
disconnects (what `script.js` + `location.reload()` do), while several
goroutines flood `Send`. It panics on `main`/v0.3.1020 today and passes with
this patch. It's the artifact to attach to the upstream issue/PR.

To turn it into a proper upstream test, drop it into
`cmd/templ/generatecmd/sse/server_test.go` as a `TestSendDoesNotPanicOnDisconnect`
that runs the flood-and-disconnect loop for N rounds and fails if the process
would panic (run with `-race`).

---

## 5. Secondary fix: retry budget (optional, independent)

Separate flaw (`templ-proxy-bug-findings.md` §3.1): the proxy's RoundTripper
retries a down upstream for `20 × (100ms × 1.5^n) ≈ 11 minutes` before
returning a bodyless `502`, so browser requests hang (blank page) through every
server-down window. `time.Sleep` there is not context-aware, so aborted
requests keep a goroutine sleeping the full schedule; and a *legitimate* `502`
from the backend is retried the same way.

Fix in `cmd/templ/generatecmd/proxy/proxy.go`:

- Lower `maxRetries` to ~5 (fail fast): worst-case hang per request becomes
  Σ 100ms·1.5ⁿ, n=0..4 ≈ 1.3 s instead of ~11 min.
- Make the backoff context-aware so aborted requests stop immediately:

```go
	select {
	case <-time.After(rt.initialDelay * time.Duration(math.Pow(rt.backoffExponent, float64(retries)))):
	case <-r.Context().Done():
		return nil, r.Context().Err()
	}
```

- Close the response body before retrying a 502 — the current loop hits
  `continue` without `resp.Body.Close()`, leaking up to 20 connections per
  hung request:

```go
		if err != nil || resp.StatusCode == http.StatusBadGateway {
			if resp != nil {
				resp.Body.Close()
			}
```

**Caveat (interaction with findings §3.3):** fail-fast alone trades "long
hang that eventually serves the page" for "fast empty-502 blank page" in
every server-down window longer than the retry budget — and server restarts
routinely exceed ~1.3 s. Because reloads fired while the browser has no SSE
connection are lost (findings §3.3), this can *increase* stuck-blank end
states unless paired with a proxy `ErrorHandler` that serves a small
auto-reloading error page instead of an empty 502. Independent of the panic
fix; ship separately.

---

## 6. If not patching templ: local workaround

No upstream change: supervise templ in a restart loop in `dev.go`
(`until go tool templ generate ...; do sleep 1; done`) so a panic self-heals in
~1s. This does **not** fix the bug — it just makes it nearly invisible. The
§2 code change is the real fix.

---

## 7. Upstream submission notes

- No issue exists for *this* panic site. Searching "send on closed channel"
  does find [#505](https://github.com/a-h/templ/issues/505) — same panic
  string, but a different code path (`generatecmd/cmd.go` error handler,
  fixed Feb 2024). Cite it in the new issue: preempts a duplicate close and
  shows this bug class has bitten the codebase before.
- [#842 "Proxy not ready, retrying infinitely"](https://github.com/a-h/templ/issues/842)
  is about the *startup readiness* retry loop (waiting for `:7331` to come
  up), not the §5 RoundTripper retries; it was closed same-day by its author.
- File a new issue with the `bug-findings-appendix/sse-repro` repro and the
  panic stack (`server.go:37`), then open a PR with the §2 patch + a
  `-race` regression test.
