import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure proper handling of API routes
  experimental: {
    serverComponentsExternalPackages: ["openai"],
  },
  // Add timeout configuration for API routes
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

export default nextConfig;
