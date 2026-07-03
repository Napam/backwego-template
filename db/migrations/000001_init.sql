-- +goose Up
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);

INSERT INTO
  users (name)
VALUES
  (
    'I come from the migration file at db/migrations/000001_init.sql'
  );

-- +goose Down
DROP TABLE IF EXISTS users;
