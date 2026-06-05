import test from "node:test";
import assert from "node:assert/strict";

import { resolveGdeltEndpoint } from "../src/lib/ingest/resolveGdeltEndpoint.mjs";

function withEnv(name, value, fn) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("server-side relative GDELT endpoints resolve through NEXT_SERVER_BASE_URL", () => {
  withEnv("NEXT_SERVER_BASE_URL", "http://argus-app:3000/", () => {
    assert.equal(
      resolveGdeltEndpoint("/api/feeds/gdelt", { isServer: true, window: "24h" }),
      "http://argus-app:3000/api/feeds/gdelt?window=24h",
    );
  });
});

test("server-side relative GDELT endpoints fall back to host and port", () => {
  withEnv("NEXT_SERVER_BASE_URL", undefined, () => {
    withEnv("NEXT_SERVER_HOST", "argus-app", () => {
      withEnv("PORT", "3000", () => {
        assert.equal(
          resolveGdeltEndpoint("/api/feeds/gdelt", { isServer: true }),
          "http://argus-app:3000/api/feeds/gdelt",
        );
      });
    });
  });
});

test("absolute GDELT endpoints keep their origin and receive the window query", () => {
  assert.equal(
    resolveGdeltEndpoint("https://example.test/api/feeds/gdelt?existing=1", {
      isServer: true,
      window: "6h",
    }),
    "https://example.test/api/feeds/gdelt?existing=1&window=6h",
  );
});
