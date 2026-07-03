package main

import (
	"backwegotemplate"
	"backwegotemplate/db"
	"backwegotemplate/lib/generated/sqlc"
	"backwegotemplate/lib/logging"
	"backwegotemplate/web/root"
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	_ "modernc.org/sqlite"
)

func main() {
	handler := logging.NewHandler(&slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	logger := slog.New(handler)

	cwd, err := os.Getwd()
	if err != nil {
		logger.Error("Could not get current workdir", slog.Any("error", err))
	}

	logger.Info("Initializing backwegotemplate", slog.String("cwd", cwd))

	router := chi.NewRouter()

	dbConn, err := sql.Open("sqlite", "./data/sqlite.db")
	if err != nil {
		panic(err)
	}
	defer func() {
		if err := dbConn.Close(); err != nil {
			logger.Error("Failed to close database", slog.Any("error", err))
		}
	}()

	_, err = db.RunMigrations(context.Background(), backwegotemplate.MigrationsFS, dbConn, logger)
	if err != nil {
		logger.Error("Could not run migrations", slog.Any("error", err))
	}

	queries := sqlc.New(dbConn)
	users, err := queries.GetAllUsers(context.Background())
	if err != nil {
		panic(err)
	}
	logger.Info("Fetched users from database", slog.Any("users", len(users)))

	backwegotemplate.SetupStatic(router)

	router.Get("/", func(w http.ResponseWriter, r *http.Request) {
		err := root.RootPage(users).Render(context.Background(), w)
		if err != nil {
			logger.Error("Root page render failed", slog.Any("error", err))
		}
	})

	logger.Info("Server running", slog.String("address", "localhost:8080"))
	err = http.ListenAndServe(":8080", router)
	if err != nil {
		logger.Error("Server did not exit cleanly", slog.Any("error", err))
		os.Exit(1)
	}
}
