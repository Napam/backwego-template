package env

import (
	"os"
	"strconv"
)

type Env struct {
	// Set DB_MIGRATE_ON_START=true (or 1, t, etc.) to enable. Defaults to false.
	DBMigrateOnStart bool
	Host             string
	Port             string
	// Live reload values are used for logging only, so they're optional.
	LiveReloadHost string
	LiveReloadPort string
}

var Vars Env

func init() {
	migrate, _ := strconv.ParseBool(os.Getenv("DB_MIGRATE_ON_START"))
	Vars = Env{
		DBMigrateOnStart: migrate,
		Host:             GetEnv("HOST", "localhost"),
		Port:             GetEnv("PORT", "6900"),
		LiveReloadHost:   os.Getenv("LIVE_RELOAD_PROXY_HOST"),
		LiveReloadPort:   os.Getenv("LIVE_RELOAD_PROXY_PORT"),
	}
}

func GetEnv(name string, fallback string) string {
	if val := os.Getenv(name); val != "" {
		return val
	}
	return fallback
}
