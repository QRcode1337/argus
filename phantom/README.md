# Phantom (ARGUS integration)

Vendored subset of [Phantom](https://github.com/QRcode1337/phantom) — the standalone anomaly detection engine using FTLE chaos math, Lyapunov exponents, and ESN reservoir computing.

This directory contains the ARGUS-specific sidecar: an Axum HTTP/WebSocket server that scores live flight trajectories and seismic patterns for chaos anomalies in real-time.

See `PHANTOM_INTEGRATION_PLAN.md` in the repo root for integration details.
