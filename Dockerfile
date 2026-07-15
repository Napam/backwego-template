FROM golang:1.26-trixie AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -s /root/.bun/bin/bunx /usr/local/bin/bunx && \
    curl -1sLf 'https://dl.cloudsmith.io/public/task/task/setup.deb.sh' | bash && \
    apt-get install -y task && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# This is to make build caching better
COPY web/package.json web/bun.lock web/
RUN --mount=type=cache,target=/root/.bun/install/cache \
    cd web && bun install --frozen-lockfile
COPY go.mod go.sum ./
RUN go mod download
# Force build cache of go tools
RUN --mount=type=cache,target=/root/.cache/go-build \
    go tool templ version

COPY . .

RUN --mount=type=cache,target=/root/.cache/go-build \
    ENV=prod CGO_ENABLED=0 task build.go && \
    chmod +x /app/bin/app

FROM scratch

COPY --from=builder app/bin/app /app/bin/app
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

WORKDIR /app

# HOST=0.0.0.0 (instead of Taskfile's localhost) so the host can reach the container
ENV HOST=0.0.0.0 PORT=8080 DB_MIGRATE_ON_START=true

ENTRYPOINT ["bin/app"]
