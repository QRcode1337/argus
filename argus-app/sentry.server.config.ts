import * as Sentry from "@sentry/nextjs";
import { raindrop } from "./src/lib/raindrop";

Sentry.init({
  dsn: process.env.GLITCHTIP_APP_DSN || process.env.GLITCHTIP_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  openTelemetrySpanProcessors: [raindrop.createSpanProcessor()],
});
