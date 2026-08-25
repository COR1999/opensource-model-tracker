import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // localhost and 127.0.0.1 must both be allowed or Next 16 blocks HMR/dev assets across the two origins
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
};

export default nextConfig;
