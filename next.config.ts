import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@daytona/sdk", "playwright-core", "@opentelemetry/sdk-trace-node"],
};

export default nextConfig;
