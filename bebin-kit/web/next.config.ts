import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // deployed as a Docker image (web/Dockerfile)
  cacheComponents: true,
  partialPrefetching: true,
  // Pages render client-side behind the splash until the persisted store hydrates (app/providers.tsx), so the
  // server never renders page segments; validate only segments that opt in with `export const instant`.
  experimental: { instantInsights: { validationLevel: "manual-warning" } },
};

export default nextConfig;
