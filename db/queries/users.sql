-- name: GetAllUsers :many
SELECT
  *
FROM
  users;

-- name: GetUser :one
SELECT
  *
FROM
  users
WHERE
  id = ?;

-- name: CreateUser :one
INSERT INTO
  users (name)
VALUES
  (?)
RETURNING *;

-- name: UpdateUserName :one
UPDATE users
SET
  name = ?
WHERE
  id = ?
RETURNING *;

-- name: DeleteUser :exec
DELETE FROM users
WHERE
  id = ?;