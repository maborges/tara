import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // A compatibilidade via compiler API evita o parser CLI incompatível
    // observado no Next 16 com a versão local do TypeScript.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
