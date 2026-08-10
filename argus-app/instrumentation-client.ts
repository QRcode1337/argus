import * as Sentry from "@sentry/nextjs";

// Only initialize client-side error reporting when the DSN is an https endpoint.
// A plain-http DSN (e.g. http://<ip>:8090) is refused by the browser on an https
// page ("Not allowed to request resource" / access-control), spamming the console
// with failed envelope POSTs. Skip init entirely in that case.
const clientDsn = process.env.NEXT_PUBLIC_GLITCHTIP_DSN;
const dsnIsHttps = typeof clientDsn === "string" && clientDsn.startsWith("https://");

if (dsnIsHttps) {
  Sentry.init({
    dsn: clientDsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.05),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
