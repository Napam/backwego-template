package env

import (
	"os"
	"strconv"
)

type Env = struct {
	// Set DB_MIGRATE_ON_START=true (or 1, t, etc.) to enable. Defaults to false.
	DbMigrateOnStart bool
	Host             string
	Port             string
	// For logging purposes only. Not needed in production, so they're optional.
	LiveReloadHost string
	// For logging purposes only. Not needed in production, so they're optional.
	LiveReloadPort string
}

var Vars *Env

func init() {
	migrate, _ := strconv.ParseBool(os.Getenv("DB_MIGRATE_ON_START"))
	Vars = &Env{
		DbMigrateOnStart: migrate,
		Host:             GetEnv("HOST", "localhost"),
		Port:             GetEnv("PORT", "8080"),
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
