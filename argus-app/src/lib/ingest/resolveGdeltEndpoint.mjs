function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}

function getServerBaseUrl() {
  const explicitBase = process.env.NEXT_SERVER_BASE_URL?.trim();
  if (explicitBase) return trimTrailingSlashes(explicitBase);

  const host = process.env.NEXT_SERVER_HOST?.trim() || "127.0.0.1";
  const port = process.env.PORT?.trim() || "3000";
  return `http://${host}:${port}`;
}

export function resolveGdeltEndpoint(endpoint, options = {}) {
  const isServer = options.isServer ?? typeof window === "undefined";
  const isRelative = endpoint.startsWith("/");

  let url = endpoint;
  if (isRelative && isServer) {
    url = new URL(endpoint, `${getServerBaseUrl()}/`).toString();
  }

  if (options.window && options.window !== "ALL") {
    const relativeBase = isServer
      ? "http://localhost"
      : typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    const next = new URL(url, relativeBase);
    next.searchParams.set("window", options.window);
    url = isRelative && !isServer
      ? `${next.pathname}${next.search}${next.hash}`
      : next.toString();
  }

  return url;
}
