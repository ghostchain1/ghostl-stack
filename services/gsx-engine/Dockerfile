# ── Build stage ──────────────────────────────────────────────────────
FROM rust:1.78-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml ./
# Cache dependency build
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo build --release 2>/dev/null || true
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ── Runtime stage ─────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/gsx-engine ./gsx-engine
RUN useradd -r -u 1001 gsxengine && chown gsxengine /app/gsx-engine
USER gsxengine
EXPOSE 8090
ENV RUST_LOG=info
CMD ["./gsx-engine"]
