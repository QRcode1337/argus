/**
 * Argus edge Worker (Option A)
 * - Default: passthrough to origin (Tunnel → DO droplet)
 * - GET|POST /analyze: gated; zone GraphQL Analytics → Workers AI summarize
 * Do NOT call env.AI on every request.
 */

const ANALYZE_PATH = "/analyze";

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

function checkSecret(request, env) {
  const expected = env.ANALYZE_SECRET;
  if (!expected) return false;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const header = request.headers.get("x-argus-analyze-secret") || "";
  return bearer === expected || header === expected;
}

async function fetchGraphQLAnalytics(env) {
  const accountId = env.CF_ACCOUNT_ID;
  const token = env.CF_API_TOKEN;
  const zoneTag = env.CF_ZONE_ID;
  if (!accountId || !token) {
    return { error: "missing CF_ACCOUNT_ID or CF_API_TOKEN" };
  }
  if (!zoneTag) {
    return { error: "missing CF_ZONE_ID (argusweb.bond zone tag)" };
  }

  // Zone-scoped adaptive groups — not account-wide httpRequests1hGroups.
  const query = `
    query ZoneTraffic($zoneTag: string!, $since: Time!, $until: Time!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequestsAdaptiveGroups(
            limit: 48
            filter: { datetime_geq: $since, datetime_lt: $until }
            orderBy: [datetime_DESC]
          ) {
            dimensions { datetimeHour clientCountryName edgeResponseStatus }
            sum { requests bytes threats }
            avg { sampleInterval }
          }
        }
      }
    }
  `;

  const until = new Date();
  const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);

  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        zoneTag,
        since: since.toISOString(),
        until: until.toISOString(),
        accountTag: accountId,
      },
    }),
  });
  const body = await res.json();
  return {
    status: res.status,
    zoneTag,
    window: { since: since.toISOString(), until: until.toISOString() },
    body,
  };
}

async function summarizeWithWorkersAI(env, analytics) {
  if (!env.AI) return { summary: null, note: "Workers AI binding missing" };
  const prompt = `Summarize this Cloudflare zone traffic for an operator (last 24h). Focus on request volume, countries, status codes, threats, and anomalies. Be concise and factual — no hype.\n\n${JSON.stringify(analytics).slice(0, 12000)}`;
  const out = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: "You are a terse traffic analyst." },
      { role: "user", content: prompt },
    ],
  });
  return { summary: out?.response ?? out };
}

async function handleAnalyze(request, env) {
  if (!checkSecret(request, env)) return unauthorized();
  const analytics = await fetchGraphQLAnalytics(env);
  const ai = await summarizeWithWorkersAI(env, analytics);
  return new Response(
    JSON.stringify({ ok: true, analytics, ai }, null, 2),
    { headers: { "content-type": "application/json" } },
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === ANALYZE_PATH || url.pathname === `${ANALYZE_PATH}/`) {
      return handleAnalyze(request, env);
    }
    // Passthrough: prefer ORIGIN_URL if set; else let zone/Tunnel routing handle origin.
    if (env.ORIGIN_URL) {
      const target = new URL(request.url);
      const origin = new URL(env.ORIGIN_URL);
      target.protocol = origin.protocol;
      target.host = origin.host;
      return fetch(new Request(target.toString(), request));
    }
    return fetch(request);
  },
};
