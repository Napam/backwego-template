// Package logging provides a colorized, human-readable slog handler. It is what
// the server wires up, so logs are readable with no setup. Color is dropped
// automatically when output is not a terminal (pipes, files, docker logs).
package logging

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
)

const (
	reset = "\033[0m"

	cyan        = 36
	darkGray    = 90
	lightRed    = 91
	lightGreen  = 92
	lightYellow = 93
	lightBlue   = 94
	white       = 97

	timeFormat = "2006-01-02T15:04:05-07:00"
)

// colorHandler renders one line per record:
//
//	time [LEVEL] message key=value key=value
//
// Attributes keep the order they were added in: WithAttrs values first, then
// the record's. Rendering by slog.Value Kind preserves types, so numbers stay
// numbers instead of going through a map.
type colorHandler struct {
	w         io.Writer
	level     slog.Leveler
	color     bool
	addSource bool
	replace   func([]string, slog.Attr) slog.Attr
	mu        *sync.Mutex
	groups    []string // open WithGroup names, outermost first
	prefix    []string // rendered WithAttrs, scoped where they were added
}

// NewHandler returns a handler that writes readable, colorized lines to stdout.
// It honors opts.Level, opts.AddSource and opts.ReplaceAttr. ReplaceAttr only
// sees attributes: the time, level and message fields are not passed through it.
func NewHandler(opts *slog.HandlerOptions) slog.Handler {
	return newHandler(os.Stdout, opts)
}

func newHandler(w io.Writer, opts *slog.HandlerOptions) *colorHandler {
	if opts == nil {
		opts = &slog.HandlerOptions{}
	}
	return &colorHandler{
		w:         w,
		level:     opts.Level,
		color:     isTerminal(w),
		addSource: opts.AddSource,
		replace:   opts.ReplaceAttr,
		mu:        &sync.Mutex{},
	}
}

// isTerminal reports whether w is a terminal, so pipes, files and the Docker
// log stream stay free of ANSI escapes.
func isTerminal(w io.Writer) bool {
	f, ok := w.(*os.File)
	if !ok {
		return false
	}
	fi, err := f.Stat()
	return err == nil && fi.Mode()&os.ModeCharDevice != 0
}

func (h *colorHandler) Enabled(_ context.Context, level slog.Level) bool {
	if h.level == nil {
		return level >= slog.LevelInfo
	}
	return level >= h.level.Level()
}

func (h *colorHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	nh := h.clone()
	for _, a := range attrs {
		nh.prefix = nh.appendAttr(nh.prefix, h.groups, a)
	}
	return nh
}

func (h *colorHandler) WithGroup(name string) slog.Handler {
	if name == "" {
		return h
	}
	nh := h.clone()
	nh.groups = append(nh.groups, name)
	return nh
}

func (h *colorHandler) Handle(_ context.Context, r slog.Record) error {
	var parts []string
	if h.addSource {
		parts = h.appendAttr(parts, nil, sourceAttr(r.PC))
	}
	parts = append(parts, h.prefix...)
	r.Attrs(func(a slog.Attr) bool {
		parts = h.appendAttr(parts, h.groups, a)
		return true
	})

	var b strings.Builder
	b.WriteString(h.colorize(darkGray, r.Time.Format(timeFormat)))
	b.WriteByte(' ')
	b.WriteString(h.levelTag(r.Level))
	b.WriteByte(' ')
	b.WriteString(h.colorize(white, r.Message))
	for _, p := range parts {
		b.WriteByte(' ')
		b.WriteString(p)
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := fmt.Fprintln(h.w, b.String())
	return err
}

func (h *colorHandler) clone() *colorHandler {
	nh := *h
	nh.groups = slices.Clone(h.groups)
	nh.prefix = slices.Clone(h.prefix)
	return &nh
}

// appendAttr renders a as "key=value" parts, scoped under the active groups.
// Group values expand inline ("http" -> http.status=200), and empty attrs are
// dropped.
func (h *colorHandler) appendAttr(parts []string, groupPath []string, a slog.Attr) []string {
	a.Value = a.Value.Resolve()
	if a.Value.Kind() == slog.KindGroup {
		path := groupPath
		if a.Key != "" {
			path = append(slices.Clone(groupPath), a.Key)
		}
		for _, sub := range a.Value.Group() {
			parts = h.appendAttr(parts, path, sub)
		}
		return parts
	}
	if a.Key == "" {
		return parts
	}
	if h.replace != nil {
		a = h.replace(groupPath, a)
		if a.Key == "" {
			return parts
		}
	}
	key := strings.Join(append(slices.Clone(groupPath), a.Key), ".")
	return append(parts, h.colorize(lightBlue, key)+"="+h.colorize(lightGreen, h.value(a.Value)))
}

// sourceAttr turns a record's program counter into a "source" attribute.
func sourceAttr(pc uintptr) slog.Attr {
	if pc == 0 {
		return slog.Attr{}
	}
	frame, _ := runtime.CallersFrames([]uintptr{pc}).Next()
	return slog.String(slog.SourceKey, fmt.Sprintf("%s:%d", frame.File, frame.Line))
}

func (h *colorHandler) value(v slog.Value) string {
	switch v.Kind() {
	case slog.KindString:
		return strconv.Quote(v.String())
	case slog.KindInt64:
		return strconv.FormatInt(v.Int64(), 10)
	case slog.KindUint64:
		return strconv.FormatUint(v.Uint64(), 10)
	case slog.KindFloat64:
		return strconv.FormatFloat(v.Float64(), 'g', -1, 64)
	case slog.KindBool:
		return strconv.FormatBool(v.Bool())
	case slog.KindDuration:
		return v.Duration().String()
	case slog.KindTime:
		return v.Time().Format(timeFormat)
	default:
		switch x := v.Any().(type) {
		case string:
			return strconv.Quote(x)
		case error:
			return strconv.Quote(x.Error())
		default:
			return fmt.Sprint(x)
		}
	}
}

func (h *colorHandler) levelTag(level slog.Level) string {
	switch {
	case level < slog.LevelInfo:
		return "[" + h.colorize(darkGray, level.String()) + "]"
	case level < slog.LevelWarn:
		return "[" + h.colorize(cyan, level.String()) + "]"
	case level < slog.LevelError:
		return "[" + h.colorize(lightYellow, level.String()) + "]"
	default:
		return "[" + h.colorize(lightRed, level.String()) + "]"
	}
}

func (h *colorHandler) colorize(code int, v string) string {
	if !h.color {
		return v
	}
	return fmt.Sprintf("\033[%dm%s%s", code, v, reset)
}
