package main

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"strconv"

	"backwegotemplate"
	"backwegotemplate/db"
	"backwegotemplate/lib/env"
	"backwegotemplate/lib/generated/sqlc"
	"backwegotemplate/lib/logging"
	"backwegotemplate/web/root"
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

	if env.Vars.DbMigrateOnStart {
		_, err = db.RunMigrations(
			context.Background(),
			backwegotemplate.MigrationsFS,
			dbConn,
			logger,
		)
		if err != nil {
			logger.Error("Could not run migrations", slog.Any("error", err))
			os.Exit(1)
		}
	}

	queries := sqlc.New(dbConn)

	backwegotemplate.SetupStatic(router)

	router.Get("/", func(w http.ResponseWriter, r *http.Request) {
		users, _ := queries.GetAllUsers(r.Context())
		editID, _ := strconv.ParseInt(r.URL.Query().Get("edit"), 10, 64)
		_ = root.RootPage(users, editID).Render(r.Context(), w)
	})

	router.Post("/users", func(w http.ResponseWriter, r *http.Request) {
		name := r.FormValue("name")
		user, _ := queries.CreateUser(r.Context(), sql.NullString{String: name, Valid: name != ""})
		http.Redirect(w, r, "/", http.StatusSeeOther)
		logger.Info(
			"Created user",
			slog.Int64("id", user.ID),
			slog.String("name", user.Name.String),
		)
	})

	router.Post("/users/{id}/update", func(w http.ResponseWriter, r *http.Request) {
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		name := r.FormValue("name")
		_, _ = queries.UpdateUserName(r.Context(), sqlc.UpdateUserNameParams{
			ID:   id,
			Name: sql.NullString{String: name, Valid: name != ""},
		})
		http.Redirect(w, r, "/", http.StatusSeeOther)
		logger.Info("Updated user", slog.Int64("id", id))
	})

	router.Post("/users/{id}/delete", func(w http.ResponseWriter, r *http.Request) {
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		_ = queries.DeleteUser(r.Context(), id)
		http.Redirect(w, r, "/", http.StatusSeeOther)
		logger.Info("Deleted user", slog.Int64("id", id))
	})

	logAttrs := []slog.Attr{
		slog.String("address", env.Vars.Host+":"+env.Vars.Port),
	}
	if env.Vars.LiveReloadHost != "" && env.Vars.LiveReloadPort != "" {
		logAttrs = append(logAttrs, slog.String(
			"live_reload_address",
			env.Vars.LiveReloadHost+":"+env.Vars.LiveReloadPort+" (you have to use 'task dev' for this to work)",
		))
	}
	logger.LogAttrs(context.Background(), slog.LevelInfo, "Server running", logAttrs...)
	err = http.ListenAndServe(env.Vars.Host+":"+env.Vars.Port, router)
	if err != nil {
		logger.Error("Server did not exit cleanly", slog.Any("error", err))
		os.Exit(1)
	}
}
