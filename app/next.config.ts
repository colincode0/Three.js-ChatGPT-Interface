import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the OpenAI SDK out of the server bundle
  serverExternalPackages: ["openai"],
};

export default nextConfig;
