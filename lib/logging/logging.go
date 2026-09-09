package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
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

func colorize(colorCode int, v string) string {
	return fmt.Sprintf("\033[%dm%s%s", colorCode, v, reset)
}

// handlerContext renders human-readable, colorized log lines to stdout. It
// delegates attribute handling to an inner JSON handler and reformats the
// result, so groups and WithAttrs keep working without reimplementing them.
type handlerContext struct {
	h slog.Handler
	b *bytes.Buffer
	m *sync.Mutex
}

func (hc *handlerContext) Enabled(ctx context.Context, level slog.Level) bool {
	return hc.h.Enabled(ctx, level)
}

func (hc *handlerContext) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &handlerContext{h: hc.h.WithAttrs(attrs), b: hc.b, m: hc.m}
}

func (hc *handlerContext) WithGroup(name string) slog.Handler {
	return &handlerContext{h: hc.h.WithGroup(name), b: hc.b, m: hc.m}
}

// formatAttrs renders attrs in sorted key order so log lines stay stable across
// runs (Go randomizes map iteration order).
func formatAttrs(attrs map[string]any) string {
	keys := make([]string, 0, len(attrs))
	for k := range attrs {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var sb strings.Builder
	for _, k := range keys {
		val := fmt.Sprint(attrs[k])
		if s, ok := attrs[k].(string); ok {
			val = strconv.Quote(s)
		}
		fmt.Fprintf(&sb, "%s=%s ", colorize(lightBlue, k), colorize(lightGreen, val))
	}
	return sb.String()
}

func (hc *handlerContext) Handle(ctx context.Context, record slog.Record) error {
	level := record.Level.String()
	switch record.Level {
	case slog.LevelDebug:
		level = colorize(darkGray, level)
	case slog.LevelInfo:
		level = colorize(cyan, level)
	case slog.LevelWarn:
		level = colorize(lightYellow, level)
	case slog.LevelError:
		level = colorize(lightRed, level)
	}
	level = "[" + level + "]"

	time := colorize(darkGray, record.Time.Format(timeFormat))
	message := colorize(white, record.Message)

	attrs, err := hc.extractAttrs(ctx, record)
	if err != nil {
		return err
	}
	if len(attrs) == 0 {
		fmt.Println(time, level, message)
		return nil
	}

	fmt.Println(time, level, message, formatAttrs(attrs))
	return nil
}

func (hc *handlerContext) extractAttrs(ctx context.Context, r slog.Record) (map[string]any, error) {
	hc.m.Lock()
	defer func() {
		hc.b.Reset()
		hc.m.Unlock()
	}()

	if err := hc.h.Handle(ctx, r); err != nil {
		return nil, fmt.Errorf("calling inner handler: %w", err)
	}

	var attrs map[string]any
	if err := json.Unmarshal(hc.b.Bytes(), &attrs); err != nil {
		return nil, fmt.Errorf("decoding inner handler output: %w", err)
	}
	return attrs, nil
}

func NewHandler(opts *slog.HandlerOptions) slog.Handler {
	if opts == nil {
		opts = &slog.HandlerOptions{}
	}
	buf := &bytes.Buffer{}
	return &handlerContext{
		b: buf,
		h: slog.NewJSONHandler(buf, &slog.HandlerOptions{
			Level:       opts.Level,
			AddSource:   opts.AddSource,
			ReplaceAttr: suppressDefaults(opts.ReplaceAttr),
		}),
		m: &sync.Mutex{},
	}
}

// suppressDefaults drops the time, level, and message keys from the inner JSON
// handler output, since Handle renders those directly from the record.
func suppressDefaults(
	next func([]string, slog.Attr) slog.Attr,
) func([]string, slog.Attr) slog.Attr {
	return func(groups []string, a slog.Attr) slog.Attr {
		if a.Key == slog.TimeKey || a.Key == slog.LevelKey || a.Key == slog.MessageKey {
			return slog.Attr{}
		}
		if next == nil {
			return a
		}
		return next(groups, a)
	}
}
