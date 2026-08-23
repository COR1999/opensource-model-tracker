import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // localhost and 127.0.0.1 must both be allowed or Next 16 blocks HMR/dev assets across the two origins
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
