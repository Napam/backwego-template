package env

import (
	"fmt"
	"os"
)

type Env = struct {
	DbMigrateOnStart bool
	Host             string
	Port             string
	// For logging purposes only
	LiveReloadHost string
	// For logging purposes only
	LiveReloadPort string
}

var Vars *Env

func init() {
	Vars = &Env{
		DbMigrateOnStart: os.Getenv("DB_MIGRATE_ON_START") == "true",
		Host:             GetRequiredEnv("HOST"),
		Port:             GetRequiredEnv("PORT"),
		LiveReloadHost:   GetRequiredEnv("LIVE_RELOAD_PROXY_HOST"),
		LiveReloadPort:   GetRequiredEnv("LIVE_RELOAD_PROXY_PORT"),
	}
}

func GetRequiredEnv(name string) string {
	val := os.Getenv(name)
	if val == "" {
		fmt.Printf("Missing required environment variable: '%s'\n", name)
		os.Exit(1)
	}
	return val
}
