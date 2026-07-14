package db

import (
	"context"
	"database/sql"
	"io/fs"
	"log/slog"

	"github.com/pressly/goose/v3"
)

func RunMigrations(
	ctx context.Context,
	migrationsFS fs.FS,
	db *sql.DB,
	logger *slog.Logger,
) ([]*goose.MigrationResult, error) {
	provider, err := goose.NewProvider(
		goose.DialectSQLite3,
		db,
		migrationsFS,
		goose.WithSlog(logger),
		goose.WithVerbose(true),
	)
	if err != nil {
		return nil, err
	}

	result, err := provider.Up(ctx)
	if err != nil {
		return result, err
	}

	return result, nil
}
