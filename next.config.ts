import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The proxy buffers request bodies; default 10MB would truncate video uploads.
  experimental: { proxyClientMaxBodySize: "100mb" },
  serverExternalPackages: ["@daytona/sdk", "playwright-core", "@opentelemetry/sdk-trace-node", "@arizeai/openinference-instrumentation-anthropic", "anchorbrowser"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
