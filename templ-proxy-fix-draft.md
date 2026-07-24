# templ live-reload proxy: fix draft

Fix for the `panic: send on closed channel` race in templ's SSE handler
(see `templ-proxy-bug-findings.md` §1 for the diagnosis). Verified against
templ v0.3.1020 and current `main` — the buggy code is byte-identical in both,
and the `Send` method has not changed since the original hot-reload commits
(#130 in 2023, #470 in Jan 2024), so this has been latent for ~2.5 years.

**File:** `cmd/templ/generatecmd/sse/server.go` (upstream `a-h/templ`).

**Status 2026-07-24:** §1, §2 and §5 are applied in the fork at
`~/repos/templ` (`b36b91d`, `31b67cd`, `1fe0850`; the touched packages
pass `go test`). Not yet wired into the project — `go.mod` needs
`replace github.com/a-h/templ => /Users/naphat/repos/templ` (one directive
covers runtime and tool; `cmd/templ` is not its own module in the fork).

§5 covers a second, independent bug: one-off `templ generate` runs wipe the
dev-mode `_templ.txt` files a live watch session renders from (findings
§6). Symptom is an empty page from the _app itself_, not a dead proxy.

---

## 0. Scope: which fix solves what

"Blank page at 7331" has **two independent causes** (findings §1 vs §3), and
the fixes below are not interchangeable:

| Fix                                           | What it solves                                                                                                           | Needed to stop the crash?                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **§1 — abandonable send (the essential fix)** | templ panics `send on closed channel` → whole process dies → proxy refuses connections until `task dev` is restarted     | **Yes. Necessary and sufficient.**                                                                 |
| §2 — retry budget                             | Browser requests _hang_ (blank page + spinner, up to ~11 min) during server-down windows — happens with **zero crashes** | No. Optional UX hardening for a separate flaw in a separate file (`proxy.go`, not `sse/server.go`) |
| §3 — restart-loop supervision                 | Same crash as §1, but only self-heals it (~1 s) instead of fixing it                                                     | No. This is the **alternative** to §1 for when you can't patch templ — not an addition to it       |

- If you can patch templ (fork / `replace` / upstream PR merged): **do §1,
  skip §3**; add §2 only if the hang windows bother you.
- If you're pinned to upstream releases: **§3 is the stand-in** until the §1
  PR merges; §2 remains independently useful.
- Neither direction substitutes: §1 does nothing for hang windows, and
  neither §2 nor §3 prevents the panic.

A third "blank page" cause sits outside this table entirely: the _app_
returning empty 200s because its dev-mode `_templ.txt` files were deleted
(findings §6) — the proxy faithfully forwards them. Fixed in §5.

---

## 1. The essential fix: make `Send` abandonable

This is the fix for the reported issue. It eliminates the panic class **by
construction**: with no `close` on the events channel, "send on closed
channel" cannot happen, regardless of timing.

### 1.1 Root cause (recap)

`Send` holds the mutex only long enough to _spawn_ one goroutine per client;
the actual `f <- event` runs **outside the mutex**, in a detached goroutine,
on an **unbuffered** channel. The disconnect cleanup takes the mutex, deletes
the id, and `close(events)`. Nothing coordinates a still-parked send
goroutine with that close → `panic: send on closed channel`. Because the
panicking goroutine is spawned by `Send` (not an `http.Server` handler
goroutine), `net/http`'s per-connection `recover` does not catch it, so the
whole templ process dies.

The precise trigger is _"a send goroutine still blocked on the send at the
instant `close` runs."_ A single spaced-out event is consumed instantly by
the parked reader, so it never lingers — which is why one-by-one edits are
safe and bursts (≥2 near-simultaneous sends) crash it.

### 1.2 The patch

Give each connection a `done` signal, `select` on it in the send goroutine,
and **never close the events channel** (let GC reclaim it). ~15 lines, no
behavioral downside.

**Track a `done` channel per client**

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

**Make the send abandonable**

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

**Close `done` on disconnect — but not `events`**

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

### 1.3 Why this is correct

- **No send-on-closed panic** — `events` is never closed, so the send can't
  panic. It's just an unreferenced channel after the handler returns; GC
  reclaims it. Note the original `close(events)` was _functionally dead_: it
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

### 1.4 Regression test

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

## 2. Optional: retry budget (fixes request hangs — _not_ the crash)

Separate flaw in a separate file (`templ-proxy-bug-findings.md` §3.1): the
proxy's RoundTripper retries a down upstream for
`20 × (100ms × 1.5^n) ≈ 11 minutes` before returning a bodyless `502`, so
browser requests hang (blank page + spinner) through every server-down
window. `time.Sleep` there is not context-aware, so aborted requests keep a
goroutine sleeping the full schedule; and a _legitimate_ `502` from the
backend is retried the same way.

This section exists because the symptom (blank page at 7331) is
indistinguishable from the §1 crash — but nothing here affects the panic,
and the §1 fix does not depend on anything here. Ship separately.

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
connection are lost (findings §3.3), this can _increase_ stuck-blank end
states unless paired with a proxy `ErrorHandler` that serves a small
auto-reloading error page instead of an empty 502.

---

## 3. If you can't patch templ: restart-loop workaround (alternative to §1)

Only relevant when §1 is not an option (pinned to an upstream release that
still has the bug). Supervise templ in a restart loop in `dev.go`
(`until go tool templ generate ...; do sleep 1; done`) so a panic self-heals
in ~1 s.

This does **not** fix the bug — it just makes it nearly invisible, and it is
the **alternative** to §1, not a complement: once §1 is applied, a restart
loop adds nothing for this issue (residual value: insurance against other,
hypothetical templ panics). Don't do both for this bug.

---

## 4. Upstream submission notes

- No issue exists for _this_ panic site. Searching "send on closed channel"
  does find [#505](https://github.com/a-h/templ/issues/505) — same panic
  string, but a different code path (`generatecmd/cmd.go` error handler,
  fixed Feb 2024). Cite it in the new issue: preempts a duplicate close and
  shows this bug class has bitten the codebase before.
- [#842 "Proxy not ready, retrying infinitely"](https://github.com/a-h/templ/issues/842)
  is about the _startup readiness_ retry loop (waiting for `:7331` to come
  up), not the §2 RoundTripper retries; it was closed same-day by its author.
- File a new issue with the `bug-findings-appendix/sse-repro` repro and the
  panic stack (`server.go:37`), then open a PR with the §1 patch + a
  `-race` regression test.
- The §5 txt-file fix is a separate issue/PR. Lead argument: a one-off
  (non-watch) `templ generate` never writes txt files (`devMode` =
  `Args.Watch`) and never serves from them (`TEMPL_DEV_MODE` is only
  exported under `--watch`), so running `deleteWatchModeTextFiles` there
  has zero legitimate function — it can only destroy a concurrent watch
  session's files. Note that single-file runs (`-f`) are not affected
  (they return before cleanup), which is why editor on-save plugins don't
  reproduce it. Attach a before/after experiment like findings §6.5 as the
  repro.

---

## 5. Dev-mode `_templ.txt` wipe (findings §6) — applied in fork `1fe0850`

Different bug, different symptom from §1: `localhost:8080` itself returns
`200 OK` with 0 bytes, and the proxy faithfully forwards it. In dev mode
every static literal is read from a `templ_<sha256>.txt` file in `$TMPDIR`
at request time; if the file is missing, `WriteString` fails, `Render`
errors, and handlers that discard the error (`_ = ...Render(...)`) send an
empty response.

### 5.1 Root cause (recap)

`deleteWatchModeTextFiles()` runs at the end of **every** full-project
`templ generate`, including one-off non-watch runs (`task check.go`,
`task gen.templ`), deleting txt files a concurrent watch session's dev
server still needs. The watcher doesn't self-heal because its in-memory
hash map (`CompareAndSwap` with `UpdateIfChanged`) skips the rewrite when
the literals are unchanged — it can't see that the file vanished.

### 5.2 The patches (applied)

**Patch A — gate cleanup on watch mode** (`cmd/templ/generatecmd/cmd.go`):

```go
// Clean up temporary watch mode text files. Only do this for watch
// sessions: a one-off generate must not delete the text files of a
// dev session that is still running, since its server renders from
// them (missing files make every page render as an empty response).
if cmd.Args.Watch {
	if err := cmd.deleteWatchModeTextFiles(); err != nil {
		cmd.Log.Warn("Failed to delete watch mode text files", slog.Any("error", err))
	}
}
```

**Patch B — rewrite missing txt files** (`cmd/templ/generatecmd/eventhandler.go`):

```go
// Rewrite the file if the literals changed, or if it vanished from
// disk (deleted externally) — otherwise the running dev server keeps
// rendering empty pages until the literals happen to change.
_, statErr := os.Stat(txtFileName)
if h.hashes.CompareAndSwap(txtFileName, syncmap.UpdateIfChanged, txtHash) || statErr != nil {
	if err = os.WriteFile(txtFileName, []byte(joined), 0o644); err != nil {
		return result, nil, fmt.Errorf("failed to write string literal file %q: %w", txtFileName, err)
	}
}
```

### 5.3 Why this is correct

- A one-off generate never writes txt files (`devMode` = `Args.Watch`) and
  never serves from them (`TEMPL_DEV_MODE` is only exported to the `--cmd`
  child under `--watch`), so gating cleanup on `Watch` removes pure
  destruction and nothing else. Watch-session teardown still cleans up on
  exit — verified: txt is deleted when the fork's watch session ends.
- Patch B costs one extra `stat` per regeneration, dev-mode only.
  Rewriting on any stat error (not just `ErrNotExist`) is safe: a
  genuinely broken path fails loudly at `WriteFile`.
- Single-file runs (`-f`) return before cleanup either way, so editor
  plugins are unaffected by the change.

### 5.4 Verification

`tmp/txt-fix-verify/` experiment, 2026-07-24 (stock v0.3.1020 binary vs
fork binary) — full table in findings §6.5: upstream one-off generate
deletes a live session's txt (bug reproduced); the fork's doesn't
(Patch A); fork watch exit still cleans up; a manually deleted txt is
rewritten on the next regeneration even with unchanged literal hashes
(Patch B).

**Limitation (verified):** Patch B only heals files that get regenerated —
a deleted txt whose template is never edited again stays missing, and its
pages stay empty, until the session restarts.

### 5.5 Optional follow-up: degrade instead of failing the render

`runtime/watchmode.go`, `GetWatchedString`: on `errors.Is(err,
fs.ErrNotExist)` return `defaultValue` instead of an error:

```go
literals, err := sl.getWatchedStrings(txtFilePath)
if err != nil {
	if errors.Is(err, fs.ErrNotExist) {
		return defaultValue, nil // stale text beats an empty page
	}
	return "", fmt.Errorf("templ: failed to get watched strings for %q: %w", path, err)
}
```

Turns "empty page" into "compiled-in (possibly stale) text" —
structurally consistent because the defaults match the compiled literal
indices. Closes the residual gap (deleters other than this binary: global
installs, editor plugins doing full generates, OS `$TMPDIR` cleaning;
files never edited again). Gate strictly on `ErrNotExist` so
permission/corruption errors still fail loudly. Separate upstream PR —
it's a runtime-semantics change, unlike the two generator-side patches
above.
