import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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
