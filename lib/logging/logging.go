package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"
)

const (
	reset = "\033[0m"

	BLACK         = 30
	RED           = 31
	GREEN         = 32
	YELLOW        = 33
	BLUE          = 34
	MAGENTA       = 35
	CYAN          = 36
	DARK_GRAY     = 90
	LIGHT_GRAY    = 37
	LIGHT_RED     = 91
	LIGHT_GREEN   = 92
	LIGHT_YELLOW  = 93
	LIGHT_BLUE    = 94
	LIGHT_MAGENTA = 95
	LIGHT_CYAN    = 96
	LIMEGREEN     = 92
	WHITE         = 97

	timeFormat = "2006-01-02T15:04:05-07:00"
)

func colorize(colorCode int, v string) string {
	return fmt.Sprintf("\033[%sm%s%s", strconv.Itoa(colorCode), v, reset)
}

type HandlerContext struct {
	h slog.Handler
	b *bytes.Buffer
	m *sync.Mutex
}

func (handlerContext *HandlerContext) Enabled(ctx context.Context, level slog.Level) bool {
	return handlerContext.h.Enabled(ctx, level)
}

func (handlerContext *HandlerContext) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &HandlerContext{h: handlerContext.h.WithAttrs(attrs), b: handlerContext.b, m: handlerContext.m}
}

func (handlerContext *HandlerContext) WithGroup(name string) slog.Handler {
	return &HandlerContext{h: handlerContext.h.WithGroup(name), b: handlerContext.b, m: handlerContext.m}
}

func StringifyMap(m map[string]any) string {
	var sb strings.Builder
	for k, v := range m {
		if s, ok := v.(string); ok {
			escaped := strings.ReplaceAll(s, `"`, `\"`)
			fmt.Fprintf(&sb, "%s=\"%s\" ", colorize(LIGHT_BLUE, k), colorize(LIMEGREEN, escaped))
		} else {

			fmt.Fprintf(&sb, "%s=%v ", colorize(LIGHT_BLUE, k), colorize(LIMEGREEN, fmt.Sprintf("%v", v)))
		}
	}
	return sb.String()
}

func (handlerContext *HandlerContext) Handle(ctx context.Context, record slog.Record) error {
	level := record.Level.String()
	switch record.Level {
	case slog.LevelDebug:
		level = colorize(DARK_GRAY, level)
	case slog.LevelInfo:
		level = colorize(CYAN, level)
	case slog.LevelWarn:
		level = colorize(LIGHT_YELLOW, level)
	case slog.LevelError:
		level = colorize(LIGHT_RED, level)
	}

	level = fmt.Sprintf("[%s]", level)
	time := colorize(DARK_GRAY, record.Time.Format(timeFormat))
	message := colorize(WHITE, record.Message)

	attrs, err := handlerContext.extractAttrs(ctx, record)
	if err != nil {
		return err
	}
	if len(attrs) == 0 {
		fmt.Println(
			time,
			level,
			message,
		)
		return nil
	}

	fmt.Println(
		time,
		level,
		message,
		StringifyMap(attrs),
	)

	return nil
}

func (handlerContext *HandlerContext) extractAttrs(
	ctx context.Context,
	r slog.Record,
) (map[string]any, error) {
	handlerContext.m.Lock()
	defer func() {
		handlerContext.b.Reset()
		handlerContext.m.Unlock()
	}()
	if err := handlerContext.h.Handle(ctx, r); err != nil {
		return nil, fmt.Errorf("error when calling inner handler's Handle: %w", err)
	}

	var attrs map[string]any
	err := json.Unmarshal(handlerContext.b.Bytes(), &attrs)
	if err != nil {
		return nil, fmt.Errorf("error when unmarshaling inner handler's Handle result: %w", err)
	}
	return attrs, nil
}

func NewHandler(opts *slog.HandlerOptions) *HandlerContext {
	if opts == nil {
		opts = &slog.HandlerOptions{}
	}
	b := &bytes.Buffer{}
	return &HandlerContext{
		b: b,
		h: slog.NewJSONHandler(b, &slog.HandlerOptions{
			Level:       opts.Level,
			AddSource:   opts.AddSource,
			ReplaceAttr: supressDefaults(opts.ReplaceAttr),
		}),
		m: &sync.Mutex{},
	}
}

func supressDefaults(
	next func([]string, slog.Attr) slog.Attr,
) func([]string, slog.Attr) slog.Attr {
	return func(groups []string, a slog.Attr) slog.Attr {
		if a.Key == slog.TimeKey ||
			a.Key == slog.LevelKey ||
			a.Key == slog.MessageKey {
			return slog.Attr{}
		}
		if next == nil {
			return a
		}
		return next(groups, a)
	}
}
