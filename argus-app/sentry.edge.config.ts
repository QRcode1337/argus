import * as Sentry from "@sentry/nextjs";

const edgeDsn = process.env.NEXT_PUBLIC_GLITCHTIP_DSN;

if (typeof edgeDsn === "string" && edgeDsn.startsWith("https://")) {
  Sentry.init({
    dsn: edgeDsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.05),
  });
}
