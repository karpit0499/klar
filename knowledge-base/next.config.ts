import type { NextConfig } from "next";

const configuredBasePath = process.env.NEXT_PUBLIC_KB_BASE_PATH?.trim() || "";
const basePath = configuredBasePath === "/"
  ? ""
  : configuredBasePath.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
