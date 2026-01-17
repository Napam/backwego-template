package main

import (
	"context"
	"database/sql"
	"backwegotemplate"
	"backwegotemplate/lib/generated/sqlc"
	"backwegotemplate/lib/hashfs"
	"backwegotemplate/lib/logging"
	"backwegotemplate/web/root"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	_ "modernc.org/sqlite"
)

func main() {
	handler := logging.NewHandler(&slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	logger := slog.New(handler)

	router := chi.NewRouter()

	db, err := sql.Open("sqlite", "./data/sqlite.db")
	if err != nil {
		panic(err)
	}
	defer db.Close()

	queries := sqlc.New(db)
	users, err := queries.GetAllUsers(context.Background())
	if err != nil {
		panic(err)
	}
	logger.Info("Fetched users from database", slog.Any("users", len(users)))

	router.Handle("/static/*", hashfs.FileServer(backwegotemplate.HashFS))

	router.Get("/", func(w http.ResponseWriter, r *http.Request) {
		root.RootPage(users).Render(context.Background(), w)
	})

	logger.Info("Server running", slog.String("address", "localhost:8080"))
	http.ListenAndServe(":8080", router)
}
