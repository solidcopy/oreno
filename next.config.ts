import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 大きな文書でも保存できるよう、Server Actionのボディ上限をデフォルト(1MB)から広げる
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
