FROM rust:1.82-slim-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
# Dummy src for dependency caching
RUN mkdir src && echo "fn main(){}" > src/main.rs && echo "" > src/lib.rs
RUN cargo build --release 2>/dev/null || true
# Real source
COPY src/ src/
RUN touch src/main.rs src/lib.rs && cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/phantom /usr/local/bin/phantom
ENV PHANTOM_ADDR=0.0.0.0:7700
EXPOSE 7700
CMD ["phantom"]
