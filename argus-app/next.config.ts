import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  // Turbopack disabled to prevent os error 60 file read timeouts with large Cesium assets
  serverExternalPackages: ["cesium"],
  webpack: (config) => {
    // Tell webpack NOT to parse the Cesium static assets (thousands of files causing ETIMEDOUT)
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        "**/.git/**",
        "**/.next/**",
        "**/node_modules/**",
        "**/public/cesium/**",
      ],
    };

    // Disable resolving of binary workers that crash Turbopack/Webpack
    if (config.resolve && config.resolve.fallback) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }

    return config;
  },
};

export default withSentryConfig(nextConfig, {
  org: "argus",
  project: "argus-app",
  silent: true,
  disableLogger: true,
  sourcemaps: {
    disable: true,
  },
});
