import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // @phosphor-icons/react is NOT in Next's built-in optimizePackageImports
    // list, so a barrel import (`import { Foo } from "@phosphor-icons/react"`)
    // pulls the whole icon set into the client bundle and slows first load and
    // hydration. Opting it in rewrites each import to the single icon module.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
