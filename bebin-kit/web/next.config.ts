import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // deployed as a Docker image (web/Dockerfile)
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
