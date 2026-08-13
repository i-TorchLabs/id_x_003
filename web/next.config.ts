import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*"],
  async redirects() {
    return [
      {
        source: "/",
        destination: "/f/aa/login",
        permanent: false,
      },
      {
        source: "/f/aa",
        destination: "/f/aa/login",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/b/:path*",
        destination: `${process.env.BACKEND_URL ?? "http://localhost"}/b/:path*`,
      },
    ];
  },
};

export default nextConfig;
