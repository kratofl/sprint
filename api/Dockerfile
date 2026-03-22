# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.26-alpine AS builder

WORKDIR /build

# Copy go.work so the workspace resolver can find all modules
COPY go.work go.work.sum ./

# Copy shared package first (depended on by api)
COPY pkg/ ./pkg/

# Copy API module
COPY api/ ./api/

WORKDIR /build/api

RUN go build -trimpath -ldflags="-s -w" -o /sprint-api .

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM alpine:latest AS runtime

# CA certs for outbound HTTPS (e.g. auth provider calls)
RUN apk --no-cache add ca-certificates

RUN addgroup --system --gid 1001 sprint && \
    adduser --system --uid 1001 sprint

WORKDIR /app

COPY --from=builder --chown=sprint:sprint /sprint-api ./sprint-api

USER sprint

EXPOSE 8080

ENTRYPOINT ["./sprint-api"]
