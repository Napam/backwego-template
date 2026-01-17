-- +goose Up
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);

INSERT INTO
  users (name)
VALUES
  ('test');

-- +goose Down
DROP TABLE IF EXISTS users;
