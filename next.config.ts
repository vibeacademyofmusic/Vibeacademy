import type { NextConfig } from "next";

function localDevOrigin() {
  const raw = process.env.NEXT_PUBLIC_APP_URL
  if (!raw) return
  try {
    const hostname = new URL(raw).hostname
    if (hostname === "localhost" || hostname === "127.0.0.1") return
    return hostname
  } catch {
    return
  }
}

const devOrigin = localDevOrigin()

const nextConfig: NextConfig = {
  ...(devOrigin ? { allowedDevOrigins: [devOrigin] } : {}),
};

export default nextConfig;
